"""
Tests for periodic review reminder generation.
"""

import datetime


from sync.goals.reminders import (
    get_review_reminders_for_date,
    get_periodic_reminders_for_date,
)


class TestGetReviewRemindersForDate:
    """Tests for get_review_reminders_for_date() function."""

    def test_sunday_generates_weekly_review(self):
        """Sunday should generate a weekly review reminder."""
        # 2025-01-05 is a Sunday (week 1)
        sunday = datetime.date(2025, 1, 5)
        reminders = get_review_reminders_for_date(sunday)

        weekly = [r for r in reminders if "W" in r.body]
        assert len(weekly) == 1
        assert weekly[0].body == "Review [[2025-W01]] + Goals"
        assert weekly[0].deadline == sunday
        assert weekly[0].done is False

    def test_non_sunday_no_weekly_review(self):
        """Non-Sunday should not generate a weekly review reminder."""
        # 2025-01-06 is a Monday
        monday = datetime.date(2025, 1, 6)
        reminders = get_review_reminders_for_date(monday)

        weekly = [r for r in reminders if "W" in r.body]
        assert len(weekly) == 0

    def test_last_day_of_month_generates_monthly_review(self):
        """Last day of month should generate a monthly review reminder."""
        # 2025-01-31 is last day of January
        last_jan = datetime.date(2025, 1, 31)
        reminders = get_review_reminders_for_date(last_jan)

        monthly = [r for r in reminders if r.body.startswith("Review [[2025-01]]")]
        assert len(monthly) == 1
        assert monthly[0].deadline == last_jan

    def test_not_last_day_no_monthly_review(self):
        """Non-last day of month should not generate a monthly review reminder."""
        # 2025-01-30 is not last day
        jan_30 = datetime.date(2025, 1, 30)
        reminders = get_review_reminders_for_date(jan_30)

        monthly = [r for r in reminders if "2025-01" in r.body and "W" not in r.body]
        assert len(monthly) == 0

    def test_dec_31_generates_yearly_review(self):
        """December 31 should generate a yearly review reminder."""
        dec_31 = datetime.date(2025, 12, 31)
        reminders = get_review_reminders_for_date(dec_31)

        yearly = [r for r in reminders if r.body == "Review [[2025]] + Goals"]
        assert len(yearly) == 1
        assert yearly[0].deadline == dec_31

    def test_not_dec_31_no_yearly_review(self):
        """Non-December-31 should not generate a yearly review reminder."""
        dec_30 = datetime.date(2025, 12, 30)
        reminders = get_review_reminders_for_date(dec_30)

        # Dec 30 is not Dec 31, should not have yearly
        yearly = [r for r in reminders if r.body == "Review [[2025]] + Goals"]
        assert len(yearly) == 0

    def test_dec_31_sunday_generates_all_three(self):
        """Dec 31 that is also a Sunday should generate weekly, monthly, and yearly."""
        # 2028-12-31 is a Sunday AND last day of December AND end of year
        dec_31_sunday = datetime.date(2028, 12, 31)
        reminders = get_review_reminders_for_date(dec_31_sunday)

        # Should have all three types
        assert len(reminders) == 3
        bodies = {r.body for r in reminders}
        assert any("W" in b for b in bodies)  # weekly
        assert "Review [[2028-12]] + Goals" in bodies  # monthly
        assert "Review [[2028]] + Goals" in bodies  # yearly

    def test_reminder_has_required_fields(self):
        """Reminder should have all required Goal fields."""
        sunday = datetime.date(2025, 1, 5)
        reminders = get_review_reminders_for_date(sunday)

        assert len(reminders) >= 1
        reminder = reminders[0]

        assert reminder.body is not None
        assert reminder.date_str is not None
        assert reminder.deadline is not None
        assert reminder.id is not None
        assert reminder.done is not None
        assert reminder.reminder_offset == 0

    def test_february_leap_year(self):
        """February 29 in leap year should generate monthly review."""
        # 2028 is a leap year
        feb_29 = datetime.date(2028, 2, 29)
        reminders = get_review_reminders_for_date(feb_29)

        monthly = [r for r in reminders if "2028-02" in r.body]
        assert len(monthly) == 1

    def test_february_non_leap_year(self):
        """February 28 in non-leap year should generate monthly review."""
        # 2025 is not a leap year
        feb_28 = datetime.date(2025, 2, 28)
        reminders = get_review_reminders_for_date(feb_28)

        monthly = [r for r in reminders if "2025-02" in r.body]
        assert len(monthly) == 1


class TestGetPeriodicRemindersForDate:
    """Tests for get_periodic_reminders_for_date() function."""

    def test_odd_week_sunday_generates_restart_reminder(self):
        """Sunday of an odd ISO week should generate restart reminder."""
        # 2026-02-01 is Sunday of ISO week 5 (odd)
        sunday_odd = datetime.date(2026, 2, 1)
        reminders = get_periodic_reminders_for_date(sunday_odd)

        assert len(reminders) == 1
        assert reminders[0].body == "Restart MacBook"
        assert reminders[0].deadline == sunday_odd

    def test_even_week_sunday_no_restart_reminder(self):
        """Sunday of an even ISO week should NOT generate restart reminder."""
        # 2026-02-08 is Sunday of ISO week 6 (even)
        sunday_even = datetime.date(2026, 2, 8)
        reminders = get_periodic_reminders_for_date(sunday_even)

        assert len(reminders) == 0

    def test_odd_week_non_sunday_no_reminder(self):
        """Non-Sunday of an odd week should NOT generate restart reminder."""
        # 2026-01-21 is Wednesday of ISO week 4 (even) - let's use week 5
        # 2026-01-22 is Thursday of ISO week 4... wait, let me check
        # Actually: 2026-01-19 (Mon) to 2026-01-25 (Sun) is week 4
        # 2026-01-26 (Sun) ends week 5? No - ISO week ends on Sunday
        # Let me use a Monday of week 5: 2026-01-26 is Sunday ending week 4
        # Week 5 is Jan 26 (Mon) - Feb 1 (Sun)? No, ISO weeks start Monday.
        # 2026-01-26 is a Sunday. isocalendar() = (2026, 5, 7)
        # So Monday Jan 26 would be week 5 day 1? No, Jan 26 2026 is Sunday.
        # Let's use Jan 20, 2026 (Tuesday of week 4)
        tuesday_week4 = datetime.date(2026, 1, 20)
        reminders = get_periodic_reminders_for_date(tuesday_week4)

        assert len(reminders) == 0

    def test_two_weeks_apart_both_trigger(self):
        """Two Sundays 14 days apart should both trigger if both are odd weeks."""
        # 2026-02-08 is Sunday of ISO week 6 (even), so no reminder.
        # 2026-02-15 is Sunday of ISO week 7 (odd), so reminder.
        feb_8 = datetime.date(2026, 2, 8)

        # Feb 8, 2026: isocalendar = (2026, 6, 7) - even week Sunday
        reminders_feb8 = get_periodic_reminders_for_date(feb_8)
        assert len(reminders_feb8) == 0  # even week, no reminder

        # Feb 15, 2026: isocalendar = (2026, 7, 7) - odd week Sunday
        feb_15 = datetime.date(2026, 2, 15)
        reminders_feb15 = get_periodic_reminders_for_date(feb_15)
        assert len(reminders_feb15) == 1  # odd week, reminder!

    def test_restart_reminder_has_deadline(self):
        """Restart reminder should have deadline set for TODAY/LATE rendering."""
        # Jan 18, 2026 is Sunday of ISO week 3 (odd).
        sunday_odd = datetime.date(2026, 1, 18)
        reminders = get_periodic_reminders_for_date(sunday_odd)

        assert len(reminders) == 1
        assert reminders[0].deadline == sunday_odd
        assert reminders[0].date_str == "2026-01-18"
        assert reminders[0].done is False
