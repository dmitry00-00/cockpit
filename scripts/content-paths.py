"""Shared content-root routing for setting importers and their loaded helpers."""
import os


CONTENT_ROOT_ENV = 'DM_COCKPIT_CONTENT_ROOT'


def content_root(repo_root):
    configured = os.environ.get(CONTENT_ROOT_ENV)
    return os.path.abspath(configured) if configured else os.path.join(repo_root, 'content')


def content_path(repo_root, *parts):
    return os.path.join(content_root(repo_root), *parts)


def set_content_root(path):
    if path:
        os.environ[CONTENT_ROOT_ENV] = os.path.abspath(path)
