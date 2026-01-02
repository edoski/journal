"""
Tests for periodic review reminder generation.
"""
import datetime


from sync_utils.reminders import get_review_reminders_for_date


class TestGetReviewRemindersForDate:
    """Tests for get_review_reminders_for_date() function."""

    def test_sunday_generates_weekly_review(self):
        """Sunday should generate a weekly review reminder."""
        # 2025-01-05 is a Sunday (week 1)
        sunday = datetime.date(2025, 1, 5)
        reminders = get_review_reminders_for_date(sunday)
        
        weekly = [r for r in reminders if "W" in r["body"]]
        assert len(weekly) == 1
        assert weekly[0]["body"] == "Review [[2025-W01]]"
        assert weekly[0]["deadline"] == sunday
        assert weekly[0]["done"] is False

    def test_non_sunday_no_weekly_review(self):
        """Non-Sunday should not generate a weekly review reminder."""
        # 2025-01-06 is a Monday
        monday = datetime.date(2025, 1, 6)
        reminders = get_review_reminders_for_date(monday)
        
        weekly = [r for r in reminders if "W" in r["body"]]
        assert len(weekly) == 0

    def test_last_day_of_month_generates_monthly_review(self):
        """Last day of month should generate a monthly review reminder."""
        # 2025-01-31 is last day of January
        last_jan = datetime.date(2025, 1, 31)
        reminders = get_review_reminders_for_date(last_jan)
        
        monthly = [r for r in reminders if r["body"].startswith("Review [[2025-01]]")]
        assert len(monthly) == 1
        assert monthly[0]["deadline"] == last_jan

    def test_not_last_day_no_monthly_review(self):
        """Non-last day of month should not generate a monthly review reminder."""
        # 2025-01-30 is not last day
        jan_30 = datetime.date(2025, 1, 30)
        reminders = get_review_reminders_for_date(jan_30)
        
        monthly = [r for r in reminders if "2025-01" in r["body"] and "W" not in r["body"]]
        assert len(monthly) == 0

    def test_dec_31_generates_yearly_review(self):
        """December 31 should generate a yearly review reminder."""
        dec_31 = datetime.date(2025, 12, 31)
        reminders = get_review_reminders_for_date(dec_31)
        
        yearly = [r for r in reminders if r["body"] == "Review [[2025]]"]
        assert len(yearly) == 1
        assert yearly[0]["deadline"] == dec_31

    def test_not_dec_31_no_yearly_review(self):
        """Non-December-31 should not generate a yearly review reminder."""
        dec_30 = datetime.date(2025, 12, 30)
        reminders = get_review_reminders_for_date(dec_30)
        
        # Dec 30 is not Dec 31, should not have yearly
        yearly = [r for r in reminders if r["body"] == "Review [[2025]]"]
        assert len(yearly) == 0

    def test_dec_31_sunday_generates_all_three(self):
        """Dec 31 that is also a Sunday should generate weekly, monthly, and yearly."""
        # 2028-12-31 is a Sunday AND last day of December AND end of year
        dec_31_sunday = datetime.date(2028, 12, 31)
        reminders = get_review_reminders_for_date(dec_31_sunday)
        
        # Should have all three types
        assert len(reminders) == 3
        bodies = {r["body"] for r in reminders}
        assert any("W" in b for b in bodies)  # weekly
        assert "Review [[2028-12]]" in bodies  # monthly
        assert "Review [[2028]]" in bodies  # yearly

    def test_reminder_has_required_fields(self):
        """Reminder should have all required task dict fields."""
        sunday = datetime.date(2025, 1, 5)
        reminders = get_review_reminders_for_date(sunday)
        
        assert len(reminders) >= 1
        reminder = reminders[0]
        
        assert "body" in reminder
        assert "date_str" in reminder
        assert "deadline" in reminder
        assert "id" in reminder
        assert "done" in reminder
        assert "reminder_offset" in reminder
        assert reminder["reminder_offset"] == 0

    def test_february_leap_year(self):
        """February 29 in leap year should generate monthly review."""
        # 2028 is a leap year
        feb_29 = datetime.date(2028, 2, 29)
        reminders = get_review_reminders_for_date(feb_29)
        
        monthly = [r for r in reminders if "2028-02" in r["body"]]
        assert len(monthly) == 1

    def test_february_non_leap_year(self):
        """February 28 in non-leap year should generate monthly review."""
        # 2025 is not a leap year
        feb_28 = datetime.date(2025, 2, 28)
        reminders = get_review_reminders_for_date(feb_28)
        
        monthly = [r for r in reminders if "2025-02" in r["body"]]
        assert len(monthly) == 1
