"""Build the bundled AcWing course catalog from a cnblogs index page."""

from __future__ import annotations

import html
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup, Tag

INDEX_URL = "https://www.cnblogs.com/littlehb/p/15393332.html"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "acwing-course.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CodeForgeOJ/1.0; educational import)"}


def clean(text: str) -> str:
    text = html.unescape(text).replace("\\(", "").replace("\\)", "")
    text = re.sub(r"[ \t\u3000]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def fetch(url: str) -> BeautifulSoup:
    response = requests.get(url, headers=HEADERS, timeout=25)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def problem_id(title: str) -> str | None:
    acwing = re.search(r"AcWin(?:g)?\D{0,12}(\d+)", title, re.I)
    if acwing:
        return f"AW{acwing.group(1)}"
    luogu = re.search(r"\bP(\d{3,6})\b", title, re.I)
    return f"P{luogu.group(1)}" if luogu else None


def catalog() -> list[dict[str, str]]:
    soup = fetch(INDEX_URL)
    body = soup.select_one("#cnblogs_post_body")
    if not body:
        raise RuntimeError("catalog body not found")
    lecture = "其他"
    topic = "未分类"
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for node in body.find_all(["h3", "h4", "a"]):
        text = clean(node.get_text(" ", strip=True))
        if node.name == "h3":
            lecture = text
            continue
        if node.name == "h4":
            topic = text
            continue
        pid = problem_id(text)
        href = node.get("href", "")
        if not pid or pid in seen or urlparse(href).hostname != "www.cnblogs.com":
            continue
        seen.add(pid)
        title = re.sub(r"^.*?\d+\s*[.．]?\s*", "", text).strip() or text
        rows.append({"id": pid, "title": title, "url": href, "lecture": lecture, "topic": topic})
    return rows


def relevant_text(soup: BeautifulSoup, row: dict[str, str]) -> str:
    body = soup.select_one("#cnblogs_post_body")
    if not body:
        return ""
    headings = body.find_all(["h1", "h2", "h3", "h4"])
    target = None
    number = row["id"].removeprefix("AW").removeprefix("P")
    for heading in headings:
        heading_text = clean(heading.get_text(" ", strip=True))
        if re.search(rf"(?<!\d){re.escape(number)}(?!\d)", heading_text):
            target = heading
            break
    if target and sum(1 for heading in headings if problem_id(clean(heading.get_text(" ", strip=True)))) > 1:
        parts: list[str] = []
        for node in target.next_siblings:
            if isinstance(node, Tag) and node.name in {"h1", "h2", "h3", "h4"} and problem_id(clean(node.get_text(" ", strip=True))):
                break
            if isinstance(node, Tag):
                parts.append(node.get_text("\n", strip=True))
        return clean("\n".join(parts))
    return clean(body.get_text("\n", strip=True))


def between(text: str, starts: list[str], ends: list[str]) -> str:
    start_at = -1
    start_len = 0
    for marker in starts:
        match = re.search(marker, text, re.I)
        if match and (start_at < 0 or match.start() < start_at):
            start_at, start_len = match.start(), match.end() - match.start()
    if start_at < 0:
        return ""
    chunk = text[start_at + start_len :]
    end_at = len(chunk)
    for marker in ends:
        match = re.search(marker, chunk, re.I)
        if match:
            end_at = min(end_at, match.start())
    result = clean(chunk[:end_at]).strip("：: \n")
    return re.sub(r"\n?[一二三四五六七八九十]+[、.．]\s*$", "", result).strip()


def extract(row: dict[str, str], soup: BeautifulSoup) -> dict:
    text = relevant_text(soup, row)
    description = between(text, [r"题目描述", r"题目内容"], [r"输入格式", r"输入说明"])
    input_format = between(text, [r"输入格式", r"输入说明"], [r"输出格式", r"输出说明"])
    output_format = between(text, [r"输出格式", r"输出说明"], [r"数据范围", r"输入样例", r"样例输入"])
    constraints = between(text, [r"数据范围", r"数据规模"], [r"输入样例", r"样例输入", r"算法", r"思路", r"代码"])
    sample_input = between(text, [r"输入样例[：:]?", r"样例输入[：:]?"], [r"输出样例", r"样例输出"])
    sample_output = between(text, [r"输出样例[：:]?", r"样例输出[：:]?"], [r"算法", r"思路", r"实现", r"代码", r"证明", r"注意"])
    if constraints:
        description = clean(f"{description}\n\n数据范围：{constraints}")
    valid = bool(description and input_format and output_format and sample_input and sample_output)
    if not description:
        description = f"该题来自《AcWing 算法基础课》目录。自动提取未能完整识别题面，请通过来源链接核对后使用 AI 重新整理。"
    samples = [{"id": 1, "input": sample_input, "output": sample_output}] if sample_input and sample_output else []
    return {
        "id": row["id"],
        "title": row["title"],
        "difficulty": "普及",
        "time": "1000 ms",
        "memory": "128 MB",
        "description": description,
        "inputFormat": input_format or "请参考来源页面中的输入格式。",
        "outputFormat": output_format or "请参考来源页面中的输出格式。",
        "samples": samples,
        "folder": f"acwing/{row['lecture']}/{row['topic']}",
        "sourceUrl": row["url"],
        "sourceIndex": INDEX_URL,
        "extractionStatus": "complete" if valid else "needs_review",
    }


def main() -> None:
    rows = catalog()
    urls = sorted({row["url"] for row in rows})
    pages: dict[str, BeautifulSoup] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(fetch, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                pages[url] = future.result()
            except Exception:
                pages[url] = BeautifulSoup("", "html.parser")
    problems = [extract(row, pages[row["url"]]) for row in rows]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(problems, ensure_ascii=False, indent=2), encoding="utf-8")
    complete = sum(problem["extractionStatus"] == "complete" for problem in problems)
    print(json.dumps({"problems": len(problems), "complete": complete, "needs_review": len(problems) - complete, "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
