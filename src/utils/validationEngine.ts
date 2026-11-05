import { ColumnDef, RowData, Sheet, ValidationRule, ValidationRuleType } from '../types/spreadsheet';
import { isFormula, FormulaEngine } from './formulaEngine';

export interface CellValidationError {
  message: string;
  severity: 'error' | 'warning';
  ruleType: ValidationRuleType;
}

/**
 * Validates a single cell value against a column's ValidationRule
 */
export function validateCellValue(
  value: any,
  rule: ValidationRule,
  allColumnValues: any[],
  columnName = 'Kolom'
): { isValid: boolean; message?: string } {
  if (!rule || rule.type === 'none') {
    return { isValid: true };
  }

  // Handle empty / null values
  const isValueEmpty = value === null || value === undefined || String(value).trim() === '';

  // Required rule check
  if (rule.type === 'required') {
    if (isValueEmpty) {
      return {
        isValid: false,
        message: rule.customErrorMessage || `${columnName} wajib diisi (tidak boleh kosong).`,
      };
    }
    return { isValid: true };
  }

  // If value is empty and rule is not 'required', consider it valid (unless required is combined)
  if (isValueEmpty) {
    return { isValid: true };
  }

  // Number coercion
  const num = Number(value);
  const isNum = !isNaN(num) && String(value).trim() !== '';

  switch (rule.type) {
    case 'numeric': {
      if (!isNum) {
        return {
          isValid: false,
          message: rule.customErrorMessage || `${columnName} harus berupa angka numerik yang valid.`,
        };
      }
      return { isValid: true };
    }

    case 'positive_number': {
      if (!isNum || num <= 0) {
        return {
          isValid: false,
          message: rule.customErrorMessage || `${columnName} harus berupa angka positif lebih dari 0 (> 0).`,
        };
      }
      return { isValid: true };
    }

    case 'range': {
      if (!isNum) {
        return {
          isValid: false,
          message: `${columnName} harus berupa angka untuk validasi rentang.`,
        };
      }
      if (rule.min !== undefined && num < rule.min) {
        return {
          isValid: false,
          message:
            rule.customErrorMessage ||
            `${columnName} tidak boleh kurang dari batas minimal (${rule.min.toLocaleString('id-ID')}).`,
        };
      }
      if (rule.max !== undefined && num > rule.max) {
        return {
          isValid: false,
          message:
            rule.customErrorMessage ||
            `${columnName} tidak boleh melebihi batas maksimal (${rule.max.toLocaleString('id-ID')}).`,
        };
      }
      return { isValid: true };
    }

    case 'unique': {
      const valStr = String(value).trim().toLowerCase();
      const occurrences = allColumnValues.filter((v) => {
        if (v === null || v === undefined) return false;
        return String(v).trim().toLowerCase() === valStr;
      }).length;

      if (occurrences > 1) {
        return {
          isValid: false,
          message:
            rule.customErrorMessage ||
            `${columnName} harus bernilai unik. Nilai "${value}" terdeteksi duplikat ${occurrences} kali.`,
        };
      }
      return { isValid: true };
    }

    case 'email': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(String(value).trim())) {
        return {
          isValid: false,
          message: rule.customErrorMessage || `Format email "${value}" pada ${columnName} tidak valid.`,
        };
      }
      return { isValid: true };
    }

    case 'options': {
      if (rule.allowedOptions && rule.allowedOptions.length > 0) {
        const valStr = String(value).trim();
        const matches = rule.allowedOptions.some(
          (opt) => opt.trim().toLowerCase() === valStr.toLowerCase()
        );
        if (!matches) {
          return {
            isValid: false,
            message:
              rule.customErrorMessage ||
              `Nilai harus salah satu dari: [${rule.allowedOptions.join(', ')}].`,
          };
        }
      }
      return { isValid: true };
    }

    case 'regex': {
      if (rule.pattern) {
        try {
          const regex = new RegExp(rule.pattern);
          if (!regex.test(String(value))) {
            return {
              isValid: false,
              message: rule.customErrorMessage || `Nilai tidak sesuai format pola (${rule.pattern}).`,
            };
          }
        } catch {
          return { isValid: true };
        }
      }
      return { isValid: true };
    }

    default:
      return { isValid: true };
  }
}

/**
 * Validates all cells in a sheet against all defined column validation rules.
 * Automatically resolves formulas to their evaluated values before validating!
 */
export function validateSheet(sheet: Sheet): Map<string, CellValidationError> {
  const errorMap = new Map<string, CellValidationError>();
  const formulaEngine = new FormulaEngine(sheet);

  sheet.columns.forEach((col) => {
    // Also treat Primary Key as implicitly unique if not specified
    const rule: ValidationRule | undefined = col.validation || (col.isPrimaryKey ? { type: 'unique' } : undefined);
    if (!rule || rule.type === 'none') return;

    // Collect all column values (with formulas evaluated)
    const allColValues = sheet.data.map((row) => {
      const rawVal = row[col.key];
      return isFormula(rawVal) ? formulaEngine.evaluateCell(row._id, col.key) : rawVal;
    });

    sheet.data.forEach((row) => {
      const rawVal = row[col.key];
      const evaluatedVal = isFormula(rawVal) ? formulaEngine.evaluateCell(row._id, col.key) : rawVal;

      // If formula returned an error code, skip custom validation (formula engine handles it)
      if (typeof evaluatedVal === 'string' && evaluatedVal.startsWith('#')) {
        return;
      }

      const result = validateCellValue(evaluatedVal, rule, allColValues, col.name);
      if (!result.isValid && result.message) {
        errorMap.set(`${row._id}:${col.key}`, {
          message: result.message,
          severity: rule.severity || 'error',
          ruleType: rule.type,
        });
      }
    });
  });

  return errorMap;
}

export function getValidationRuleLabel(type: ValidationRuleType): string {
  switch (type) {
    case 'numeric':
      return 'Harus Angka Numerik';
    case 'positive_number':
      return 'Angka Positif (> 0)';
    case 'range':
      return 'Rentang Angka (Min - Max)';
    case 'unique':
      return 'Nilai Unik (Tanpa Duplikat)';
    case 'required':
      return 'Wajib Diisi';
    case 'email':
      return 'Format Email Valid';
    case 'options':
      return 'Daftar Pilihan Tertentu';
    case 'regex':
      return 'Pola Regex Kustom';
    default:
      return 'Tidak Ada Validasi';
  }
}
