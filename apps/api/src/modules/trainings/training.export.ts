export function csvCell(value:unknown):string {const raw=String(value??"");const safe=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replace(/"/g,'""')}"`;}
