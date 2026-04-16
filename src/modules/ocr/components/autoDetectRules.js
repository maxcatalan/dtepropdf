export const AUTO_DETECT_RULE_MODE = {
  OFF: 'off',
  FIELD_VALUE: 'field_value',
  VALUE_ONLY: 'value_only',
};

export function getAutoDetectRuleState(triggers = []) {
  const trigger = Array.isArray(triggers) ? triggers[0] : null;

  if (!trigger?.field_value?.trim()) {
    return {
      mode: AUTO_DETECT_RULE_MODE.OFF,
      fieldName: '',
      fieldValue: '',
    };
  }

  const mode = trigger.match_type === AUTO_DETECT_RULE_MODE.VALUE_ONLY || !trigger.field_name?.trim()
    ? AUTO_DETECT_RULE_MODE.VALUE_ONLY
    : AUTO_DETECT_RULE_MODE.FIELD_VALUE;

  return {
    mode,
    fieldName: mode === AUTO_DETECT_RULE_MODE.FIELD_VALUE ? (trigger.field_name || '') : '',
    fieldValue: trigger.field_value || '',
  };
}

export function buildAutoDetectTriggers(mode, fieldName, fieldValue) {
  const trimmedField = fieldName.trim();
  const trimmedValue = fieldValue.trim();

  if (mode === AUTO_DETECT_RULE_MODE.OFF || !trimmedValue) return [];

  if (mode === AUTO_DETECT_RULE_MODE.VALUE_ONLY) {
    return [{
      match_type: AUTO_DETECT_RULE_MODE.VALUE_ONLY,
      field_name: '',
      field_value: trimmedValue,
    }];
  }

  if (!trimmedField) return [];

  return [{
    match_type: AUTO_DETECT_RULE_MODE.FIELD_VALUE,
    field_name: trimmedField,
    field_value: trimmedValue,
  }];
}

export function isAutoDetectRuleValid(mode, fieldName, fieldValue) {
  if (mode === AUTO_DETECT_RULE_MODE.OFF) return true;
  if (!fieldValue.trim()) return false;
  if (mode === AUTO_DETECT_RULE_MODE.VALUE_ONLY) return true;
  return fieldName.trim().length > 0;
}
