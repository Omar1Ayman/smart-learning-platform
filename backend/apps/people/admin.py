from django.contrib import admin

from .models import Enrollment, TeacherAssignment

admin.site.register([TeacherAssignment, Enrollment])
