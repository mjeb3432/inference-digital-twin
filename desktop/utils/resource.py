import sys
import os


def resource_path(relative_path: str) -> str:
    """
    Returns an absolute path to a resource, whether we're running in development
    or from a PyInstaller onefile executable.
    """
    base_path = getattr(sys, '_MEIPASS', os.path.abspath("."))
    return os.path.join(base_path, relative_path)
