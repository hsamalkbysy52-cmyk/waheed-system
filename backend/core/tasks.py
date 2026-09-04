"""Tenant-aware Celery tasks (ADR-0003, plan §3.8).

A task decorated with ``tenant_task`` takes the Restaurant's schema name as its first argument and
runs its body inside that schema, so a background job can no more reach another Restaurant's rows
than a request can. Views enqueue with ``request.tenant.schema_name``; nothing else is accepted.
"""

from functools import wraps

from celery import shared_task
from django_tenants.utils import schema_context

from tenants.models import Restaurant


class UnknownSchema(LookupError):
    """The schema name names no Restaurant: refuse rather than run against nothing."""


def tenant_task(function=None, **task_options):
    """``@tenant_task`` or ``@tenant_task(name=...)``: a shared Celery task whose first positional
    argument is the schema name."""

    def decorate(body):
        @wraps(body)
        def run(schema_name: str, *args, **kwargs):
            if not Restaurant.objects.filter(schema_name=schema_name).exists():
                raise UnknownSchema(schema_name)
            with schema_context(schema_name):
                return body(*args, **kwargs)

        return shared_task(**task_options)(run)

    return decorate(function) if function is not None else decorate
