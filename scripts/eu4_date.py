"""Mirrors geo-explorer's src/utils/dateUtils.ts eu4DateToDays exactly, so
converted event dates land on the same numeric axis as the UI slider bounds
(START_YEAR=2 .. END_YEAR=9999) planned in docs/earth-history-plan.md."""

CUM_MONTH_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
START_YEAR = 2


def day_of_year(month: int, day: int) -> int:
    return CUM_MONTH_DAYS[month - 1] + day


def eu4_date_to_days(date_str: str) -> int:
    y_s, m_s, d_s = date_str.split(".")
    y, m, d = int(y_s), int(m_s), int(d_s)
    start_d = day_of_year(1, 1)
    year_days = (y - START_YEAR) * 365
    current_d = day_of_year(m, d)
    return year_days + current_d - start_d
