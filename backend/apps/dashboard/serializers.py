"""Dashboard serializers — read-only, shaped for the UI.

Not ModelSerializers because the dashboard is an aggregation across
multiple models; the shapes are the payload the frontend charts consume,
not a resource with a natural CRUD lifecycle.
"""

from rest_framework import serializers


class TimeSeriesPointSerializer(serializers.Serializer):
    date = serializers.DateField()
    attempts = serializers.IntegerField()
    avg_percentage = serializers.FloatField(allow_null=True)


class AssessmentSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    assessment_type = serializers.CharField()
    status = serializers.CharField()
    attempts_count = serializers.IntegerField()
    avg_percentage = serializers.FloatField(allow_null=True)
    created_at = serializers.DateTimeField()


class StudentSummarySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    name = serializers.CharField()
    enrolled_at = serializers.DateTimeField()
    group_name = serializers.CharField()


class UpcomingAssessmentSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    assessment_type = serializers.CharField()
    starts_at = serializers.DateTimeField(allow_null=True)
    ends_at = serializers.DateTimeField(allow_null=True)
    duration_minutes = serializers.IntegerField(allow_null=True)
    my_attempts_used = serializers.IntegerField()
    max_attempts = serializers.IntegerField()


class RecentResultSerializer(serializers.Serializer):
    attempt_id = serializers.UUIDField()
    assessment_id = serializers.UUIDField()
    assessment_title = serializers.CharField()
    score = serializers.CharField(allow_null=True)
    max_score = serializers.CharField()
    percentage = serializers.FloatField()
    is_passed = serializers.BooleanField(allow_null=True)
    status = serializers.CharField()
    submitted_at = serializers.DateTimeField(allow_null=True)