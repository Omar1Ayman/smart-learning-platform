from django.contrib import admin

from .models import AcademicYear, Chapter, Course, Grade, Group, Lesson, Stage, Subject, Term

admin.site.register([AcademicYear, Term, Stage, Grade, Group, Subject, Course, Chapter, Lesson])
