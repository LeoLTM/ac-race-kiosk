"""Modules of the racekiosk AC app.

Named racekiosk_lib (not "lib") because all AC apps share one Python interpreter and sys.modules:
a generic package name would collide with other installed apps.

Everything except ui.py and sim_info.py is plain Python 3.3 without AC imports, so it can be unit tested
on a desktop Python (see ac-app/tests).
"""

# Placeholder for runs from the repo. The CI build (.github/workflows/ac-app.yml) replaces this line in the
# packaged copy: the tag without its "v" on releases (v0.1.0 -> 0.1.0), "0.0.0-dev+<commit>" otherwise.
APP_VERSION = "0.0.0-dev"
