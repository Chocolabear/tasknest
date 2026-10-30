export function todayInSeoul(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type: string) =>
    parts.find(part => part.type === type)!.value;

  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function monthDays(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(
      Date.UTC(
        year,
        month,
        1 - first.getUTCDay() + index,
      ),
    );

    return {
      key: day.toISOString().slice(0, 10),
      day: day.getUTCDate(),
      inMonth: day.getUTCMonth() === month,
    };
  });
}