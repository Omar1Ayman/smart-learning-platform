from .base import *  # noqa: F401,F403

import tempfile

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
SECRET_KEY = "test-secret-key-not-for-real-use"
SIMPLE_JWT = {**SIMPLE_JWT, "SIGNING_KEY": SECRET_KEY}  # noqa: F405

# Uploaded test files go to a throwaway temp dir, never the real dev
# media/ folder — each test run starts clean and leaves nothing behind.
MEDIA_ROOT = tempfile.mkdtemp(prefix="smart_learning_test_media_")
