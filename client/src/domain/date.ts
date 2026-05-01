function pad(num) {
  return String(num).padStart(2, "0");
}

export function formatDate(date) {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

export function getTodayString() {
  return formatDate(new Date());
}

export function addDays(dateString, days) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

export function isDueOnOrBefore(dateString, todayString) {
  if (!dateString) return false;
  const due = String(dateString).trim().slice(0, 10);
  const today = String(todayString).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    return false;
  }
  return due <= today;
}
