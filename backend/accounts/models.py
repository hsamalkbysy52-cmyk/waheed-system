from django.contrib.auth.models import AbstractUser


class User(AbstractUser):
    """Platform user in the public schema.

    Declared from the first migration so AUTH_USER_MODEL never has to be swapped later.
    Email login, the role and the Restaurant link arrive with ticket 03.
    """
