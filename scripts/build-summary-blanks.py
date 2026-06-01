from __future__ import annotations

import json
import os
import re
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "summary-blanks.json"

PROMPT_OVERRIDES = {
    "계자": "직류기에서 전기자를 둘러싼 자속을 만들어 주며 주자속을 형성하는 부분은 무엇인가?\n\n정답: ________",
    "전기자": "직류기에서 계자가 만든 자속을 끊어 유기 기전력을 발생시키는 부분은 무엇인가?\n\n정답: ________",
    "정류자": "직류기에서 전기자에 유도된 교류를 외부 회로로 보내기 전에 직류로 바꾸는 부분은 무엇인가?\n\n정답: ________",
    "균압고리균압환": "직류기에서 브러시 불꽃을 줄이고 병렬 회로 간 전위 차를 보정하는 장치는 무엇인가?\n\n정답: ________",
    "타여자발전기": "직류발전기 중 외부 전원으로 계자를 여자하므로 잔류자기가 없어도 발전할 수 있는 것은 무엇인가?\n\n정답: ________",
    "무부하특성곡선": "발전기를 무부하로 운전할 때 계자 전류와 단자 전압의 관계를 나타내는 곡선은 무엇인가?\n\n정답: ________",
    "분권전동기": "직류전동기 중 속도 변동이 작아 정속도 운전에 알맞은 전동기는 무엇인가?\n\n정답: ________",
    "전기동력계": "대형 직류전동기의 토크를 측정할 때 사용하는 계기는 무엇인가?\n\n정답: ________",
    "전자유도": "변압기는 1차 권선의 자속 변화가 2차 권선에 전압을 유도하는 원리로 동작한다. 이 기본 원리는 무엇인가?\n\n정답: ________",
    "등가회로": "변압기의 전기 회로와 자기 회로를 계산하기 쉽도록 하나의 전기 회로로 바꿔 나타낸 회로는 무엇인가?\n\n정답: ________",
    "고정손": "변압기 손실 중 부하가 변해도 거의 변하지 않는 철손 계열의 손실은 무엇인가?\n\n정답: ________",
    "가변손": "변압기 손실 중 부하 전류 변화에 따라 달라지는 동손 계열의 손실은 무엇인가?\n\n정답: ________",
    "표유부하손": "변압기에서 측정과 계산으로 정확히 구하기 어려우며 철심 내부 등에서 생기는 부하 손실은 무엇인가?\n\n정답: ________",
    "단락시험": "변압기 부하손실을 측정할 때 한쪽 권선을 단락하고 실시하는 시험은 무엇인가?\n\n정답: ________",
    "탭절환변압기": "배전 계통에서 권선 탭을 바꾸어 배전 전압을 일정하게 유지하는 변압기는 무엇인가?\n\n정답: ________",
    "변류기": "큰 전류를 계측기나 계전기가 취급할 수 있는 작은 전류로 바꾸는 계기용 기기는 무엇인가?\n\n정답: ________",
    "사구슬롯": "유도전동기 철심 홈을 비스듬히 만들어 소음을 줄이는 슬롯 구조는 무엇인가?\n\n정답: ________",
    "회전계자형": "동기발전기는 보통 전기자를 고정자로 두고 계자를 회전자로 두는 구조를 쓴다. 이 구조의 명칭은 무엇인가?\n\n정답: ________",
    "무부하포화곡선": "동기발전기를 무부하로 운전할 때 유도 기전력과 계자 전류의 관계를 나타내는 곡선은 무엇인가?\n\n정답: ________",
    "동기검정기": "교류 전원을 병렬 운전하기 전에 두 전원의 위상이 맞는지 점검하는 기기는 무엇인가?\n\n정답: ________",
    "누설리액턴스": "동기기에서 돌발 단락 전류를 제한하는 데 관계되는 리액턴스는 무엇인가?\n\n정답: ________",
    "동기리액턴스": "동기기에서 정상적인 영구 단락 전류를 제한하는 리액턴스는 무엇인가?\n\n정답: ________",
    "정류": "전력 변환에서 다이오드 등을 이용해 교류를 직류로 바꾸는 작용은 무엇인가?\n\n정답: ________",
    "정공": "반도체에서 결합 전자가 빠져나간 자리에 생기는 양전하처럼 동작하는 빈자리는 무엇인가?\n\n정답: ________",
    "평활회로": "정류 회로 출력에 남은 교류 성분을 콘덴서 등을 이용해 줄이는 회로는 무엇인가?\n\n정답: ________",
    "애벌런치항복전압": "반도체 접합에서 온도가 높아질수록 증가하는 항복 전압은 무엇인가?\n\n정답: ________",
    "GTO": "사이리스터 계열에서 게이트 신호로 켜고 끌 수 있는 자기소호 가능 소자는 무엇인가?\n\n정답: ________",
    "허용전류": "전선이나 기기가 과열되지 않고 안전하게 계속 흘릴 수 있는 최대 전류는 무엇인가?\n\n정답: ________",
    "캡타이어케이블": "공장이나 광산처럼 이동용 전기기기에 많이 사용하는 내구성 있는 케이블은 무엇인가?\n\n정답: ________",
    "리노테이프": "연피 케이블 접속부에 사용하는 점착성이 없는 절연 테이프는 무엇인가?\n\n정답: ________",
    "터미널러그": "전선을 기계 기구의 단자에 접속할 때 전선 끝에 압착해 사용하는 접속 부품은 무엇인가?\n\n정답: ________",
    "와이어게이지": "전선의 굵기나 지름을 확인할 때 사용하는 측정 공구는 무엇인가?\n\n정답: ________",
    "프레셔툴": "터미널 러그나 슬리브를 전선에 압착할 때 사용하는 공구는 무엇인가?\n\n정답: ________",
    "클리퍼": "전기설비 작업에서 굵은 전선을 절단할 때 사용하는 공구는 무엇인가?\n\n정답: ________",
    "스프링와셔": "진동으로 볼트나 너트가 풀리는 것을 막기 위해 끼우는 와셔는 무엇인가?\n\n정답: ________",
    "절연부싱": "금속관 끝에서 전선의 절연 피복이 손상되지 않도록 보호하는 부속품은 무엇인가?\n\n정답: ________",
    "로크너트": "금속관을 박스나 캐비닛에 단단히 고정할 때 사용하는 너트는 무엇인가?\n\n정답: ________",
    "유니온커플링": "금속관을 회전시킬 수 없는 상태에서 두 금속관을 접속할 때 쓰는 커플링은 무엇인가?\n\n정답: ________",
    "어스테스터": "접지 공사의 상태를 확인하기 위해 접지 저항을 측정하는 계기는 무엇인가?\n\n정답: ________",
    "절연저항계메거": "전선이나 기기의 절연 상태를 확인하기 위해 절연 저항을 측정하는 계기는 무엇인가?\n\n정답: ________",
    "장주공사": "가공 배전선로에서 전주에 완금과 애자 등을 장치하는 공사는 무엇인가?\n\n정답: ________",
    "지선밴드": "전주에 지선을 붙일 때 지선을 전주에 고정하기 위해 사용하는 부속품은 무엇인가?\n\n정답: ________",
    "전기에너지": "전자의 이동으로 발생하고 전기 회로에서 일을 할 수 있는 에너지는 무엇인가?\n\n정답: ________",
    "대전": "어떤 물체가 전자를 잃거나 얻어 전기를 띠게 되는 현상은 무엇인가?\n\n정답: ________",
    "마찰대전": "두 물체를 서로 문지를 때 전하가 이동해 전기를 띠는 현상은 무엇인가?\n\n정답: ________",
    "박리대전": "서로 밀착되어 있던 물체가 떨어질 때 전하 분리로 전기를 띠는 현상은 무엇인가?\n\n정답: ________",
    "유동대전": "액체류가 파이프 내부를 흐를 때 마찰 등으로 전기를 띠는 현상은 무엇인가?\n\n정답: ________",
    "기전력": "전원 내부에서 전위차를 만들어 전류가 흐를 수 있게 하는 힘은 무엇인가?\n\n정답: ________",
    "기자력": "자기 회로에서 자속을 계속 흐르게 하는 원인이 되는 힘은 무엇인가?\n\n정답: ________",
    "금속도체": "온도가 올라가면 자유전자의 충돌이 증가해 전기 저항이 커지는 도체는 무엇인가?\n\n정답: ________",
    "배율기": "전압계의 측정 범위를 넓히기 위해 전압계와 직렬로 접속하는 저항은 무엇인가?\n\n정답: ________",
    "분류기": "전류계의 측정 범위를 넓히기 위해 전류계와 병렬로 접속하는 저항은 무엇인가?\n\n정답: ________",
    "제벡효과": "서로 다른 두 금속의 접점에 온도 차를 주면 열기전력이 생기는 현상은 무엇인가?\n\n정답: ________",
    "펠티어효과": "두 금속의 접점에 전류를 흘릴 때 접점에서 열의 발생 또는 흡수가 일어나는 현상은 무엇인가?\n\n정답: ________",
    "톰슨효과": "한 도체의 양끝을 서로 다른 온도로 유지하고 전류를 흘릴 때 도체 내부에서 발열 또는 흡열이 생기는 현상은 무엇인가?\n\n정답: ________",
    "정전유도": "대전체를 도체 가까이에 가져가면 도체의 가까운 쪽과 먼 쪽에 서로 다른 전하가 나타나는 현상은 무엇인가?\n\n정답: ________",
    "전해콘덴서": "콘덴서 중 극성이 있어서 직류 회로에 사용하는 것은 무엇인가?\n\n정답: ________",
    "탄탈콘덴서": "콘덴서 중 극성이 있고 몰드 수지로 봉합되어 고주파 회로 등에 사용하는 것은 무엇인가?\n\n정답: ________",
    "세라믹콘덴서": "콘덴서 중 티탄산바륨 계열 세라믹을 사용하며 유전율이 크고 극성이 없는 것은 무엇인가?\n\n정답: ________",
    "정상상태": "과도 현상이 끝난 뒤 회로 전류가 일정한 값에 도달한 상태는 무엇인가?\n\n정답: ________",
}

BAD_TERMS = {
    "발생이유",
    "영향",
    "방지대책",
    "규격",
    "용도",
    "기호",
    "단위",
    "조건",
    "속도",
    "정격",
    "저압",
    "고압",
    "모양",
    "토크",
    "묽은황산구리아연",
    "보호소자",
    "최대전력전달",
}

BAD_TERM_ENDINGS = (
    "구비조건",
    "선정조건",
    "병렬운전조건",
    "종류",
    "비교",
    "규격",
    "사용이유",
    "변수",
    "제어법",
    "제동법",
    "측정",
    "범위",
    "관계",
    "가장큰곳",
    "제어",
    "기동법",
    "접속",
    "시설",
    "설치",
    "사용",
    "이용한것",
    "특성",
    "장점",
    "대책",
    "이유",
    "검출",
    "시",
    "전선",
    "권선법",
    "시간",
    "홈",
    "방지법",
    "특징",
)

BAD_TERM_PARTS = (
    "없을때",
    "할때",
    "인곳",
    "있는곳",
    "없는",
    "위한",
    "위해",
    "으로",
    "에서",
    "하고",
    "하면",
    "사용시",
    "설치시",
    "이용한",
    "바꾼다",
    "크고",
    "작고",
    "회로에",
    "정격감도",
    "분기회로",
    "지지물간",
    "전선관과",
    "전선관상호",
    "필요",
)


def category_for_page(page_no: int) -> str:
    if page_no <= 4:
        return "전기기기"
    if page_no <= 8:
        return "전기설비"
    return "전기회로"


def clean(value: str) -> str:
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[\ue000-\uf0a6\uf0a8-\uf8ff]", "", value)
    value = value.replace("⇨", " ")
    value = value.replace("→", " ")
    value = value.replace(" :", ":").replace(": ", ":")
    value = re.sub(r"\s+", " ", value)
    return value.strip(" .,\t")


def is_marker_line(line: str) -> bool:
    return line.startswith(("", "▶")) or line == ""


def strip_marker(line: str) -> str:
    return clean(re.sub(r"^[▶\s]+", "", line))


def is_noise(line: str) -> bool:
    line = clean(line)
    if not line:
        return True
    if line in {":", ".", ",", "(", ")", "-", "·", "▶"}:
        return True
    if line in {"동영상", "바로보기", "전병칠버전", "송건웅버전", "전기기기", "전기설비", "전기이론"}:
        return True
    if re.fullmatch(r"[①-⑳㉠-㉭\d\s.,:/()%~+-]+", line):
        return True
    if re.search(r"[A-Za-z]?\s*=", line) or re.search(r"[-]", line):
        return True
    return False


def normalize_term(value: str) -> str:
    value = strip_marker(value)
    value = re.sub(r"^[①-⑳㉠-㉭\d\s./-]+", "", value)
    value = re.sub(r"\([^)]*\)", "", value)
    value = value.strip(" :.,")
    return value


def is_good_term(term: str) -> bool:
    if not (2 <= len(term) <= 16):
        return False
    if term in BAD_TERMS or term.endswith(BAD_TERM_ENDINGS):
        return False
    if any(part in term for part in BAD_TERM_PARTS):
        return False
    if "과" in term and not term.endswith("효과"):
        return False
    if "의" in term and not term.endswith(("법칙", "효과")):
        return False
    if term.startswith("차"):
        return False
    if not re.search(r"[가-힣A-Za-z]", term):
        return False
    if re.search(r"[=+\[\]{}]", term):
        return False
    if re.search(r"[()]", term):
        return False
    if len(term.split()) > 3:
        return False
    return True


def is_good_definition(definition: str) -> bool:
    if not (4 <= len(definition) <= 130):
        return False
    if not re.search(r"[가-힣]", definition):
        return False
    if len(re.findall(r"[=+\[\]{}]", definition)) > 3:
        return False
    if re.search(r"[<>×%&∵\[\]]", definition):
        return False
    if re.search(r"[①-⑳㉠-㉭]", definition):
        return False
    if definition.count(",") + definition.count("·") > 4:
        return False
    if definition.count(" ") > 6:
        return False
    if "대요소" in definition:
        return False
    if re.search(r"\b(or|and)\b", definition, re.IGNORECASE):
        return False
    if definition.endswith(("등", "등측정", "등.")):
        return False
    if re.search(r"[∴△㎜]", definition):
        return False
    if any(fragment in definition for fragment in ("배감소", "개의", "상의 선중", "토크등")):
        return False
    if re.search(r"\d|[㎟㎜ΩΩ]|mA|kW|\\bV\\b", definition, re.IGNORECASE):
        return False
    if re.search(r"\b[A-Z]{1,}\b", definition):
        return False
    if definition.count("(") != definition.count(")"):
        return False
    if any(fragment in definition for fragment in (" 이하", " 이상", " 배", "분간시험", "상 선식")):
        return False
    if any(fragment in definition for fragment in ("형종단", "개소점멸", "단자 개", "S )", "E )", "P /")):
        return False
    if any(fragment in definition for fragment in ("해결법", "‘ ’")):
        return False
    if re.fullmatch(r"\S+\s+사용", definition):
        return False
    action_cues = (
        "발생",
        "연결",
        "변성",
        "방지",
        "가능",
        "관계",
        "따라",
        "하는",
        "되는",
        "하여",
        "하면",
        "위하여",
        "때",
        "사용",
        "보호",
        "제한",
        "변환",
        "생성",
        "감소",
        "증가",
        "측정",
        "압착",
        "절단",
        "고정",
        "접속",
        "현상",
        "만들",
        "흐르",
        "넓힘",
        "띠는",
        "이탈",
        "일정",
        "유지",
        "최대",
    )
    if not any(cue in definition for cue in action_cues):
        return False
    definition_cues = (
        "발생",
        "연결",
        "변성",
        "방지",
        "가능",
        "관계",
        "손실",
        "시험",
        "검출",
        "사용",
        "보호",
        "제한",
        "변환",
        "생성",
        "감소",
        "증가",
        "측정",
        "압착",
        "절단",
        "공구",
        "고정",
        "접속",
        "현상",
        "전류",
        "전압",
        "자속",
        "저항",
        "전하",
        "전자",
        "이동",
        "역수",
        "최대",
        "힘",
        "것",
    )
    if not any(cue in definition for cue in definition_cues):
        return False
    return True


def is_context_prompt(term: str, definition: str) -> bool:
    context_endings = (
        "기본원리",
        "구조",
        "측정",
        "검출",
        "위치",
        "방향",
        "원인",
        "해결법",
        "사용공구",
        "사용계기",
    )
    if not term.endswith(context_endings):
        return False
    return is_good_answer_keyword(definition)


def is_good_answer_keyword(value: str) -> bool:
    value = clean(value)
    if not (2 <= len(value) <= 14):
        return False
    if value.count(" ") > 1:
        return False
    if not re.search(r"[가-힣A-Za-z]", value):
        return False
    if re.search(r"[=+\[\]{}<>×%&∵∴△㎜]", value):
        return False
    if value.endswith(("사용", "사용.", "할것", "관계", "때문에")):
        return False
    return True


def normalize_definition(lines: list[str]) -> str:
    cleaned = []
    for line in lines:
        line = clean(line)
        if is_noise(line):
            continue
        line = line.strip(":")
        if not line or is_noise(line):
            continue
        cleaned.append(line)

    definition = " ".join(cleaned)
    definition = re.sub(r"\s+", " ", definition)
    definition = definition.replace(" .", ".").strip(" :.,")
    return definition


def display_text(value: str) -> str:
    value = clean(value)
    replacements = (
        ("직류회로", "직류 회로"),
        ("교류회로", "교류 회로"),
        ("외부회로", "외부 회로"),
        ("내부회로", "내부 회로"),
        ("전기회로", "전기 회로"),
        ("자기회로", "자기 회로"),
        ("전기저항", "전기 저항"),
        ("전기자권선", "전기자 권선"),
        ("단자전압", "단자 전압"),
        ("계자전류", "계자 전류"),
        ("부하전류", "부하 전류"),
        ("유기기전력", "유기 기전력"),
        ("지락사고시", "지락 사고 시"),
        ("전압계", "전압계"),
        ("전류계", "전류계"),
        ("에사용", "에 사용하는"),
        ("를사용", "를 사용하는"),
        ("직렬접속", "직렬 접속"),
        ("병렬접속", "병렬 접속"),
        ("전압의변성", "전압을 변성하고"),
        ("전류의변성", "전류를 변성하고"),
        ("절연저항", "절연 저항"),
        ("접지저항", "접지 저항"),
        ("최대전류", "최대 전류"),
        ("자속을", "자속을 "),
        ("전류를", "전류를 "),
        ("전압을", "전압을 "),
        ("교류를", "교류를 "),
        ("직류로", "직류로 "),
        ("끊어유기", "끊어 유기"),
        ("기전력을발생", "기전력을 발생"),
        ("불꽃방지", "불꽃 방지"),
        ("발전가능", "발전 가능"),
        ("전류와단자", "전류와 단자"),
        ("전압의관계", "전압의 관계"),
        ("부하의변화에따라", "부하의 변화에 따라 "),
        ("않는손실철손", "않는 손실(철손)"),
        ("변하는손실동손", "변하는 손실(동손)"),
        ("철심내부발생", "철심 내부에서 발생"),
        ("부하쪽을단락하고실시하는시험", "부하 쪽을 단락하고 실시하는 시험"),
        ("배전전압을", "배전 전압을 "),
        ("일정하게한다", "일정하게 하는"),
        ("절연보호를위하여", "절연 보호를 위한"),
        ("소음을줄이기위해사용", "소음을 줄이기 위해 사용하는"),
        ("교류전원의위상을점검하기위하여사용", "교류 전원의 위상을 점검하기 위해 사용하는"),
        ("유도기전력과계자", "유도 기전력과 계자"),
        ("전압계의측정범위를넓힘", "전압계의 측정 범위를 넓히는"),
        ("전류계의측정범위를넓힘", "전류계의 측정 범위를 넓히는"),
        ("도체막대기의양끝을", "도체 막대기의 양끝을 "),
        ("다른온도로", "다른 온도로 "),
        ("전류 를", "전류를"),
        ("일어나는현상", "일어나는 현상"),
        ("브러시에서", "브러시에서 "),
        ("온도가", "온도가 "),
        ("극성이있어", "극성이 있어서 "),
        ("극성이있고", "극성이 있고 "),
        ("발생하는불꽃", "발생하는 불꽃"),
        ("잔류자기가없어도", "잔류자기가 없어도 "),
        ("정속도전동기", "정속도 전동기"),
        ("유리한곳", "유리한 곳"),
        ("측정범위", "측정 범위"),
        ("온도차", "온도 차"),
        ("전기를띠는", "전기를 띠는"),
        ("서로밀착된", "서로 밀착된"),
        ("두물체사이의", "두 물체 사이의"),
        ("어떤물체가", "어떤 물체가"),
        ("전위차를만들어주는", "전위차를 만들어 주는"),
        ("계속흐르게하는", "계속 흐르게 하는"),
        ("온도상승", "온도 상승 시"),
        ("측정과계산으로", "측정과 계산으로"),
        ("구할수없는", "구할 수 없는"),
        ("변하지않는", "변하지 않는"),
        ("변하는", "변하는"),
        ("측정범위를넓힘", "측정 범위를 넓히는"),
        ("기전력발생", "기전력이 발생하는"),
        ("발열또는흡열", "발열 또는 흡열"),
        ("금속관끝에", "금속관 끝에"),
        ("금속관을", "금속관을 "),
        ("터미널을", "터미널을 "),
        ("굵은전선을", "굵은 전선을 "),
        ("전선의굵기를", "전선의 굵기를 "),
        ("기계기구의", "기계 기구의"),
        ("피복절연물을", "피복 절연물을 "),
        ("볼트풀림", "볼트 풀림"),
    )
    for old, new in replacements:
        value = value.replace(old, new)

    value = re.sub(r"\s+", " ", value).strip()
    return value


def answer_domain(answer: str, category: str) -> str:
    if "콘덴서" in answer:
        return "콘덴서"
    if "발전기" in answer:
        return "발전기"
    if "전동기" in answer:
        return "전동기"
    if "변압기" in answer:
        return "변압기"
    if answer.endswith("시험"):
        return "전기기기 시험"
    if answer.endswith("손"):
        return "전기기기 손실"
    if answer.endswith("효과"):
        return "전기 현상"
    if answer.endswith("대전"):
        return "대전 현상"
    if answer.endswith("전류"):
        return "전류"
    if answer.endswith("전압"):
        return "전압"
    if answer.endswith(("테스터", "게이지", "툴", "클리퍼", "부싱", "너트", "커플링", "밴드", "와셔")):
        return "전기설비 공구 또는 부속품"
    if category == "전기설비":
        return "전기설비"
    if category == "전기기기":
        return "전기기기"
    return "전기회로"


def clue_as_question_phrase(clue: str) -> str:
    phrase = display_text(clue)
    suffixes = (
        ("발생", "발생시키는"),
        ("변성", "변성하는"),
        ("변환", "변환하는"),
        ("감소", "감소시키는"),
        ("증가", "증가시키는"),
        ("제한", "제한하는"),
        ("보호", "보호하는"),
        ("측정", "측정하는"),
        ("압착", "압착하는"),
        ("절단", "절단하는"),
        ("접속", "접속하는"),
        ("고정", "고정하는"),
        ("연결", "연결하는"),
        ("방지", "방지하는"),
        ("가능", "가능한"),
        ("관계", "관계를 나타내는"),
        ("현상", "현상인"),
        ("힘", "힘을 내는"),
        ("것", "것인"),
    )
    for old, new in suffixes:
        if phrase.endswith(old):
            phrase = f"{phrase[:-len(old)]}{new}"
            break
    phrase = re.sub(r"\s+", " ", phrase).strip()
    return phrase


def candidate_items(lines: list[str]) -> list[tuple[str, list[str]]]:
    items: list[tuple[str, list[str]]] = []
    index = 0

    while index < len(lines):
        raw = clean(lines[index])
        if raw == "" and index + 1 < len(lines):
            raw = f"{clean(lines[index + 1])}"
            index += 1

        if not is_marker_line(raw):
            index += 1
            continue

        start = strip_marker(raw)
        term = start
        body: list[str] = []
        if ":" in start:
            term, first_body = start.split(":", 1)
            if first_body.strip():
                body.append(first_body)

        index += 1
        while index < len(lines):
            next_line = clean(lines[index])
            if next_line == "" or next_line.startswith(("", "▶")):
                break
            body.append(next_line)
            index += 1

        items.append((term, body))

    return items


def make_card(
    answer: str,
    clue: str,
    page_no: int,
    index: int,
    *,
    context: str | None = None,
) -> dict[str, object]:
    category = category_for_page(page_no)
    override = PROMPT_OVERRIDES.get(answer)
    if override:
        prompt = override
        explanation = f"{display_text(answer)}: {display_text(context or clue)}"
    elif context:
        prompt = f"다음 문맥에서 {display_text(context)}에 해당하는 핵심어는 무엇인가?\n\n정답: ________"
        explanation = f"{display_text(context)}: {display_text(answer)}"
    else:
        domain = answer_domain(answer, category)
        prompt = f"{domain}에서 다음 설명에 해당하는 것은 무엇인가?\n\n설명: {display_text(clue)}\n\n정답: ________"
        explanation = f"{display_text(answer)}: {display_text(clue)}"

    return {
        "id": f"summary-{page_no:02d}-{index:03d}",
        "year": 2026,
        "round": 0,
        "date": "요점정리",
        "number": index,
        "category": category,
        "question": prompt,
        "answer": answer,
        "explanation": explanation,
        "images": [],
        "variant": False,
        "sourceHtml": "기능사요점정리_전체.pdf",
        "solutionHtml": "",
    }


def main() -> None:
    pdf_path = os.environ.get("PDFPATH")
    if not pdf_path:
        raise SystemExit("PDFPATH environment variable is required")

    doc = fitz.open(pdf_path)
    cards = []
    seen: set[tuple[str, str]] = set()

    for page_index, page in enumerate(doc, start=1):
        lines = [line.strip() for line in page.get_text("text").splitlines() if line.strip()]
        for term_text, body_lines in candidate_items(lines):
            term = normalize_term(term_text)
            definition = normalize_definition(body_lines)

            if is_context_prompt(term, definition):
                answer = clean(definition)
                clue = term
                key = (answer, clue)
                if key in seen:
                    continue
                seen.add(key)
                cards.append(make_card(answer, clue, page_index, len(cards) + 1, context=clue))
                continue

            if not is_good_term(term) or not is_good_definition(definition):
                continue
            key = (term, definition)
            if key in seen:
                continue
            seen.add(key)
            cards.append(make_card(term, definition, page_index, len(cards) + 1))

    OUT.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"summary blanks={len(cards)} -> {OUT}")
    by_category: dict[str, int] = {}
    for card in cards:
        category = str(card["category"])
        by_category[category] = by_category.get(category, 0) + 1
    print(by_category)


if __name__ == "__main__":
    main()
