from django.contrib import admin

from .models import AcademicYear, Grade, Group, Stage, Subject, Term

admin.site.register([AcademicYear, Term, Stage, Grade, Group, Subject])
