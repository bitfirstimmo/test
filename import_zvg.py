"""Import publicly listed foreclosure records into a local SQLite database."""

from __future__ import annotations

import argparse
import html
import re
import sqlite3
import time
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://immobilienpool.de"
DEFAULT_COURT_PATH = "/amtsgerichte/amtsgericht-peine.92771/zwangsversteigerungen"
USER_AGENT = "BidFirst-ZVG-Importer/0.1 (+https://github.com/bitfirstimmo/test)"


@dataclass
class Record:
    source_url: str
    title: str = ""
    address: str = ""
    court: str = ""
    case_number: str = ""
    auction_date: str = ""
    valuation: str = ""
    auction_type: str = ""
    contact: str = ""
    raw_text: str = ""


class PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[str] = []
        self.text_parts: list[str] = []
        self.headings: list[tuple[int, str]] = []
        self._heading_level: int | None = None
        self._heading_text: list[str] = []
        self._hidden_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        if tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"] or "")
        if tag in {"script", "style", "noscript"}:
            self._hidden_depth += 1
        if tag in {"h1", "h2", "h3"} and self._hidden_depth == 0:
            self._heading_level = int(tag[1])
            self._heading_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._hidden_depth:
            self._hidden_depth -= 1
        if tag in {"h1", "h2", "h3"} and self._heading_level is not None:
            value = normalize(" ".join(self._heading_text))
            if value:
                self.headings.append((self._heading_level, value))
            self._heading_level = None
            self._heading_text = []

    def handle_data(self, data: str) -> None:
        if self._hidden_depth:
            return
        value = normalize(data)
        if value:
            self.text_parts.append(value)
            if self._heading_level is not None:
                self._heading_text.append(value)


def normalize(value: str) -> str:
    cleaned = html.unescape(value).replace("\u200b", "")
    return re.sub(r"\s+", " ", cleaned).strip()


def fetch(url: str, timeout: int = 30) -> str:
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html"})
    with urlopen(request, timeout=timeout) as response:
        encoding = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(encoding, errors="replace")


def absolute_url(value: str, base_url: str) -> str:
    return urljoin(base_url, value.split("#", 1)[0])


def detail_urls(index_html: str, index_url: str) -> list[str]:
    parser = PageParser()
    parser.feed(index_html)
    pattern = re.compile(r"/zwangsversteigerungen/[^/]+\.[0-9]+(?:$|[?#])", re.I)
    urls = {
        absolute_url(link, index_url)
        for link in parser.links
        if pattern.search(urlparse(absolute_url(link, index_url)).path)
    }
    return sorted(urls)


def first_heading(parser: PageParser, level: int) -> str:
    return next((text for item_level, text in parser.headings if item_level == level), "")


def following_value(text: str, label: str) -> str:
    match = re.search(re.escape(label) + r"\s*:?\s*(.*?)(?=\s+[A-ZÄÖÜ][^:]{1,50}:|$)", text, re.I)
    return normalize(match.group(1)) if match else ""


def extract_record(url: str, page_html: str) -> Record:
    parser = PageParser()
    parser.feed(page_html)
    text = normalize(" ".join(parser.text_parts))
    source_match = re.search(
        r"Ansprechpartner\s+oder\s+Gläubiger\s*/?\s*-?\s*vertreter\s*(.*?)(?=Weitere Informationen|Copyright|Alle oben|$)",
        text,
        re.I,
    )
    contact = normalize(source_match.group(1)) if source_match else ""
    if contact in {"-", "–", "—", "Keine Angaben", "nicht bekannt"}:
        contact = ""
    return Record(
        source_url=url,
        title=first_heading(parser, 1),
        address=following_value(text, "Adresse"),
        court=following_value(text, "Amtsgericht"),
        case_number=following_value(text, "Aktenzeichen"),
        auction_date=following_value(text, "Versteigerungstermin"),
        valuation=following_value(text, "Verkehrswert"),
        auction_type=following_value(text, "Versteigerungsart"),
        contact=contact,
        raw_text=text,
    )


def initialize_database(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS foreclosure_properties (
            id INTEGER PRIMARY KEY,
            source_url TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            address TEXT,
            court TEXT,
            case_number TEXT,
            auction_date TEXT,
            valuation TEXT,
            auction_type TEXT,
            contact TEXT,
            raw_text TEXT NOT NULL,
            imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute("CREATE INDEX IF NOT EXISTS idx_foreclosure_contact ON foreclosure_properties(contact)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_foreclosure_court ON foreclosure_properties(court)")
    connection.commit()


def save_record(connection: sqlite3.Connection, record: Record) -> None:
    connection.execute(
        """
        INSERT INTO foreclosure_properties (
            source_url, title, address, court, case_number, auction_date,
            valuation, auction_type, contact, raw_text, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(source_url) DO UPDATE SET
            title = excluded.title,
            address = excluded.address,
            court = excluded.court,
            case_number = excluded.case_number,
            auction_date = excluded.auction_date,
            valuation = excluded.valuation,
            auction_type = excluded.auction_type,
            contact = excluded.contact,
            raw_text = excluded.raw_text,
            updated_at = CURRENT_TIMESTAMP
        """,
        (
            record.source_url,
            record.title,
            record.address,
            record.court,
            record.case_number,
            record.auction_date,
            record.valuation,
            record.auction_type,
            record.contact,
            record.raw_text,
        ),
    )


def run_import(court_path: str, database: Path, delay: float) -> tuple[int, int]:
    index_url = absolute_url(court_path, BASE_URL)
    urls = detail_urls(fetch(index_url), index_url)
    connection = sqlite3.connect(database)
    initialize_database(connection)
    imported = 0
    with_contact = 0
    try:
        for url in urls:
            try:
                record = extract_record(url, fetch(url))
                save_record(connection, record)
                imported += 1
                with_contact += bool(record.contact)
                print(f"[{imported}/{len(urls)}] {record.title or url} | Kontakt: {'ja' if record.contact else 'nein'}")
            except Exception as error:
                print(f"Übersprungen: {url} ({error})")
            connection.commit()
            time.sleep(delay)
    finally:
        connection.close()
    return imported, with_contact


def main() -> None:
    parser = argparse.ArgumentParser(description="Importiert Zwangsversteigerungen von immobilienpool.de in SQLite.")
    parser.add_argument("--court-path", default=DEFAULT_COURT_PATH, help="Relativer Pfad der Amtsgerichts-ZVG-Liste")
    parser.add_argument("--database", type=Path, default=Path("data/zvg.sqlite3"), help="SQLite-Datei")
    parser.add_argument("--delay", type=float, default=0.5, help="Pause zwischen Detailseiten in Sekunden")
    arguments = parser.parse_args()
    arguments.database.parent.mkdir(parents=True, exist_ok=True)
    imported, with_contact = run_import(arguments.court_path, arguments.database, max(arguments.delay, 0.0))
    print(f"Fertig: {imported} Objekte importiert, davon {with_contact} mit Ansprechpartner/Gläubiger.")


if __name__ == "__main__":
    main()
