"""The floor plan of one Restaurant (CONTEXT.md: Table layout, Zone, Table).

One row per element the tables page draws: a Table (with its number, capacity and Zone name in
``label``), a wall or a door. The page saves the whole plan at once, so rows are replaced as a set
(plan §1.3, route 37). Lives in the Restaurant's schema (ADR-0001).
"""

from django.db import models


class TableLayoutElement(models.Model):
    element_id = models.CharField(max_length=50)  # the page's own id, e.g. "t-1"
    element_type = models.CharField(max_length=20)  # "table", "wall", "door" (plan §5.4)
    x = models.FloatField(default=0)
    y = models.FloatField(default=0)
    w = models.FloatField(default=90)
    h = models.FloatField(default=90)
    table_number = models.IntegerField(null=True, blank=True)
    capacity = models.IntegerField(null=True, blank=True)
    label = models.CharField(max_length=100, blank=True, default="")  # the Zone name

    class Meta:
        ordering = ["id"]  # the order the page saved them in

    def __str__(self) -> str:
        return f"{self.element_type} {self.element_id}"
