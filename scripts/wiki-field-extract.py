#!/usr/bin/env python3
"""Profile-driven extraction of whitelisted infobox fields from an external MediaWiki XML dump.

This is a staging extractor, not a setting package importer: it omits article bodies and writes
only to an external directory. Per-profile permission is required before it reads the dump.
"""
import argparse
from contextlib import contextmanager
import json
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
MEDIAWIKI_NS = "{http://www.mediawiki.org/xml/export-0.11/}"
CATEGORY = re.compile(r"\[\[\s*category\s*:\s*([^\]|]+)", re.I)
LICENSE_UNKNOWN = {"unknown", "unverified", "not verified", "не проверена", "не указана"}
PROFILE_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MAP_ID = re.compile(r"^[A-Za-z][A-Za-z0-9]*$")


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def direct_child_text(element, wanted):
    child = next((item for item in element if local_name(item.tag) == wanted), None)
    return child.text if child is not None and child.text else ""


def page_data(page):
    title = direct_child_text(page, "title")
    namespace = direct_child_text(page, "ns")
    page_id = direct_child_text(page, "id")
    redirect = next((item for item in page if local_name(item.tag) == "redirect"), None)
    revision = next((item for item in page if local_name(item.tag) == "revision"), None)
    text = ""
    if revision is not None:
        text_element = next((item for item in revision if local_name(item.tag) == "text"), None)
        if text_element is not None and text_element.text:
            text = text_element.text
    return {
        "title": title,
        "namespace": namespace,
        "pageId": page_id,
        "redirect": redirect.get("title") if redirect is not None else None,
        "text": text,
    }


def normalized_template_name(value):
    return re.sub(r"\s+", " ", value.strip()).casefold()


def template_blocks(text):
    """Yield top-level templates with their raw parameter text, skipping nested template bodies."""
    cursor = 0
    while cursor < len(text) - 1:
        start = text.find("{{", cursor)
        if start < 0:
            return
        depth = 1
        index = start + 2
        while index < len(text) - 1 and depth:
            if text.startswith("{{", index):
                depth += 1
                index += 2
            elif text.startswith("}}", index):
                depth -= 1
                index += 2
            else:
                index += 1
        if depth:
            return
        raw_body = text[start + 2:index - 2]
        name_match = re.match(r"\s*([^|\n{}]+?)(?=\s*(?:\||\n|$))", raw_body)
        if name_match:
            name = normalized_template_name(name_match.group(1))
            remainder = raw_body[name_match.end():]
            if remainder.lstrip().startswith("|"):
                remainder = remainder.lstrip()[1:]
            yield name, remainder
        cursor = index


def split_top_level_fields(raw):
    """Split template parameters on un-nested pipes, respecting templates and wikilinks."""
    fields = {}
    start = 0
    template_depth = 0
    link_depth = 0
    index = 0
    parts = []
    while index < len(raw):
        if raw.startswith("{{", index):
            template_depth += 1
            index += 2
        elif raw.startswith("}}", index) and template_depth:
            template_depth -= 1
            index += 2
        elif raw.startswith("[[", index):
            link_depth += 1
            index += 2
        elif raw.startswith("]]", index) and link_depth:
            link_depth -= 1
            index += 2
        elif raw[index] == "|" and template_depth == 0 and link_depth == 0:
            parts.append(raw[start:index])
            start = index + 1
            index += 1
        else:
            index += 1
    parts.append(raw[start:])
    for part in parts:
        key, separator, value = part.partition("=")
        if not separator:
            continue
        key = re.sub(r"\s+", " ", key.strip()).casefold()
        if key:
            fields[key] = value.strip()
    return fields


def field_whitelist(field_map):
    declared = field_map.get("fields") or field_map.get("editionFields")
    if not isinstance(declared, list) or not declared or any(not isinstance(name, str) or not name.strip() for name in declared):
        raise ValueError(f"карта {field_map.get('targetKind', '?')}: нужен непустой whitelist fields")
    return {re.sub(r"\s+", " ", name.strip()).casefold() for name in declared if isinstance(name, str) and name.strip()}


def article_url(base, title):
    return f"{base.rstrip('/')}/wiki/{quote(title.replace(' ', '_'), safe='()_,') }"


def ensure_extraction_allowed(profile):
    sources = profile.get("sources")
    source = sources.get("wiki") if isinstance(sources, dict) else None
    if not isinstance(source, dict):
        raise ValueError("profile.sources.wiki: нужен паспорт источника")
    for key in ("id", "url", "license", "attribution"):
        if not isinstance(source.get(key), str) or not source[key].strip():
            raise ValueError(f"profile.sources.wiki.{key}: ожидается непустая строка")
    license_name = source.get("license", "").strip()
    if source.get("allowInternalExtraction") is not True:
        raise ValueError("источник wiki не разрешён для внутреннего извлечения в профиле")
    if not license_name or license_name.casefold() in LICENSE_UNKNOWN:
        raise ValueError("в профиле не подтверждена лицензия источника wiki")
    if source.get("distribution") not in {"open", "table", "internal"}:
        raise ValueError("в профиле не задан режим распространения источника wiki")


def iter_pages(dump_path):
    for _, element in ET.iterparse(dump_path, events=("end",)):
        if local_name(element.tag) != "page":
            continue
        yield page_data(element)
        element.clear()


@contextmanager
def output_publish_lock(output_dir):
    """Serialize final publication by destination; the stable lock file is a sibling, not output data."""
    lock_path = output_dir.parent / f".{output_dir.name}.publish.lock"
    with open(lock_path, "a+b") as lock_file:
        if os.name == "nt":
            import msvcrt

            lock_file.seek(0, os.SEEK_END)
            if lock_file.tell() == 0:
                lock_file.write(b"\0")
                lock_file.flush()
            lock_file.seek(0)
            try:
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as error:
                raise ValueError("для каталога staging-вывода уже выполняется публикация") from error
            try:
                yield
            finally:
                lock_file.seek(0)
                msvcrt.locking(lock_file.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            try:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise ValueError("для каталога staging-вывода уже выполняется публикация") from error
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def extract_profile(profile, dump_path, output_dir):
    if not isinstance(profile, dict) or profile.get("format") != 1 or not isinstance(profile.get("fieldMaps"), dict):
        raise ValueError("нужен setting import profile формата 1")
    if not isinstance(profile.get("id"), str) or not PROFILE_ID.fullmatch(profile["id"]):
        raise ValueError("profile.id: допустимы строчные латинские буквы, цифры и дефис")
    ensure_extraction_allowed(profile)
    dump_path = Path(dump_path).resolve()
    output_dir = Path(output_dir).resolve()
    try:
        output_dir.relative_to(ROOT)
    except ValueError:
        pass
    else:
        raise ValueError("каталог staging-вывода должен находиться за пределами репозитория")
    if output_dir.exists() and not output_dir.is_dir():
        raise ValueError("каталог staging-вывода должен быть каталогом")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError("каталог staging-вывода должен быть пустым; существующие файлы не перезаписываются")
    output_dir.parent.mkdir(parents=True, exist_ok=True)

    source = profile["sources"]["wiki"]
    maps = []
    for map_id, field_map in profile["fieldMaps"].items():
        if not MAP_ID.fullmatch(map_id):
            raise ValueError(f"недопустимый id карты полей: {map_id}")
        if not isinstance(field_map, dict) or not isinstance(field_map.get("targetKind"), str) or not field_map["targetKind"].strip():
            raise ValueError(f"карта полей {map_id}: нужен targetKind")
        templates = field_map.get("templates")
        if not templates:
            continue  # e.g. chronology uses year-article/section rules, not an infobox template.
        if not isinstance(templates, list) or any(not isinstance(name, str) or not name.strip() for name in templates):
            raise ValueError(f"карта полей {map_id}: templates должен быть списком непустых строк")
        maps.append((map_id, field_map, {normalized_template_name(name) for name in templates}, field_whitelist(field_map)))
    if not maps:
        raise ValueError("в профиле нет карт полей с шаблонами инфобоксов")

    with tempfile.TemporaryDirectory(prefix=f".{output_dir.name}.staging-", dir=output_dir.parent) as temporary_dir:
        staging_dir = Path(temporary_dir)
        paths = {map_id: staging_dir / f"{profile['id']}--{map_id}.jsonl" for map_id, *_ in maps}
        counts = {map_id: 0 for map_id, *_ in maps}
        matched_pages = 0
        with open(staging_dir / f"{profile['id']}--redirects.jsonl", "w", encoding="utf-8") as redirects_out:
            writers = {map_id: open(path, "w", encoding="utf-8") for map_id, path in paths.items()}
            try:
                for page in iter_pages(dump_path):
                    if page["namespace"] != "0" or not page["title"]:
                        continue
                    if page["redirect"]:
                        redirects_out.write(json.dumps({
                            "title": page["title"], "target": page["redirect"],
                            "source": source["id"], "pageId": page["pageId"],
                        }, ensure_ascii=False) + "\n")
                        continue
                    categories = [value.strip() for value in CATEGORY.findall(page["text"]) if value.strip()]
                    found = list(template_blocks(page["text"]))
                    records = []
                    for map_id, field_map, templates, whitelist in maps:
                        for template, raw_fields in found:
                            if template not in templates:
                                continue
                            parsed = split_top_level_fields(raw_fields)
                            selected = {key: parsed[key] for key in sorted(whitelist) if key in parsed and parsed[key]}
                            if not selected:
                                break
                            records.append((map_id, {
                                "setting": profile["id"], "kind": field_map["targetKind"],
                                "title": page["title"], "pageId": page["pageId"], "template": template,
                                "url": article_url(source["url"], page["title"]),
                                "license": source["license"], "attribution": source["attribution"],
                                "distribution": source["distribution"],
                                "categories": categories, "fields": selected,
                            }))
                            break
                    if records:
                        matched_pages += 1
                        for map_id, record in records:
                            writers[map_id].write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
                            counts[map_id] += 1
            finally:
                for writer in writers.values():
                    writer.close()

        manifest = {
            "format": 1, "setting": profile["id"], "dumpId": source.get("dumpId"),
            "license": source["license"], "attribution": source["attribution"],
            "files": {map_id: {"path": path.name, "records": counts[map_id]} for map_id, path in paths.items()},
            "redirects": f"{profile['id']}--redirects.jsonl", "matchedPages": matched_pages,
            "bodyTextIncluded": False,
        }
        (staging_dir / f"{profile['id']}--manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        # Publish only after the full XML parse and manifest write have succeeded.
        with output_publish_lock(output_dir):
            if output_dir.exists() and (not output_dir.is_dir() or any(output_dir.iterdir())):
                raise ValueError("каталог staging-вывода должен быть пустым; существующие файлы не перезаписываются")
            had_empty_output_dir = output_dir.exists()
            if had_empty_output_dir:
                output_dir.rmdir()
            try:
                os.rename(staging_dir, output_dir)
            except Exception:
                if had_empty_output_dir and not output_dir.exists():
                    output_dir.mkdir()
                raise
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description="Извлечь whitelisted-поля инфобоксов вики в staging-каталог вне репозитория; скрипт не собирает пакет.")
    parser.add_argument("profile", help="JSON-профиль сеттинга")
    parser.add_argument("dump", help="локальный MediaWiki XML dump")
    parser.add_argument("output_dir", help="staging-каталог за пределами репозитория")
    args = parser.parse_args(argv)
    try:
        profile = json.loads(Path(args.profile).read_text(encoding="utf-8"))
        result = extract_profile(profile, args.dump, args.output_dir)
    except (OSError, ET.ParseError, json.JSONDecodeError, ValueError, KeyError, TypeError) as error:
        print(f"Ошибка импорта: {error}", file=sys.stderr)
        return 1
    print(f"{result['matchedPages']} статей; {sum(item['records'] for item in result['files'].values())} записей; staging {Path(args.output_dir).resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
