"""One timestamp format for every serializer (plan §4): ISO-8601 in UTC with a trailing ``Z``,
which is also the legacy orders format the frontend parses."""

from datetime import datetime, timezone
from typing import Optional

ISO_UTC = "%Y-%m-%dT%H:%M:%SZ"


def iso_utc(moment: Optional[datetime]) -> Optional[str]:
    if moment is None:
        return None
    return moment.astimezone(timezone.utc).strftime(ISO_UTC)
