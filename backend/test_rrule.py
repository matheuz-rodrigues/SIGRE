from datetime import datetime
from dateutil.rrule import rrulestr
from zoneinfo import ZoneInfo

dtstart = datetime(2026, 1, 5, 8, 48, tzinfo=ZoneInfo("America/Belem"))
rule = "RRULE:FREQ=WEEKLY;INTERVAL=1;WKST=MO;UNTIL=20260630T235959\nEXDATE;TZID=America/Belem:20260105T084800"

r = rrulestr(rule, dtstart=dtstart)
occurrences = list(r.between(datetime(2026, 1, 1, tzinfo=ZoneInfo("America/Belem")), datetime(2026, 1, 10, tzinfo=ZoneInfo("America/Belem")), inc=True))
print(f"Number of occurrences: {len(occurrences)}")
for o in occurrences:
    print(o.isoformat())
