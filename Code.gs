/**
 * Google Sheets 프로그래매틱 SEO 생성기
 * region, target, details, rules 시트를 읽어
 * final 시트에 키워드와 주소를 새로 만듭니다.
 */
const APP = Object.freeze({
  BASE_URL: 'https://kimsenglish.co.kr',
  SHEETS: Object.freeze({
    FINAL: 'final',
    REGION: 'region',
    TARGET: 'target',
    DETAILS: 'details',
    RULES: 'rules',
  }),
  HEADERS: Object.freeze({
    FINAL: [
      'id', 'domain', 'slug', 'status', 'language', 'province', 'region', 'subject', 'target',
      'keyword', 'title', 'description', 'search_intent', 'summary', 'lesson_focus',
      'lesson_method', 'lesson_result', 'tone', 'template',
    ],
    REGION: ['사용', '시도', '지역', '시도영문', '지역영문'],
    REGION_LEGACY: ['사용', '지역', '영문주소'],
    TARGET: ['사용', '대상', '영문주소', '대상유형'],
    DETAILS: [
      '사용', '세부키워드', '영문주소', '분류', '접미어', '대상제한', '본문템플릿',
      '검색의도', '핵심고민', '수업초점', '수업방식', '기대변화', '톤',
    ],
    RULES: ['사용', '조합유형', '패턴', '대표페이지'],
  }),
});

// description은 slug에 따라 아래 8개 문장 조합 중 하나를 고정 선택합니다.
const DESCRIPTION_PATTERNS = Object.freeze([
  function (c) { return c.who + ' ' + c.concern + ' ' + c.focus; },
  function (c) { return c.who + ' ' + c.intent + ' ' + c.method; },
  function (c) { return c.who + ' ' + c.focus + ' ' + c.result; },
  function (c) { return c.who + ' ' + c.concern + ' ' + c.method; },
  function (c) { return c.who + ' ' + c.intent + ' ' + c.result; },
  function (c) { return c.who + ' ' + c.method + ' ' + c.focus; },
  function (c) { return c.who + ' ' + c.result + ' ' + c.concern; },
  function (c) { return c.who + ' ' + c.focus + ' ' + c.intent; },
]);

const ALLOWED_TEMPLATES = Object.freeze(['conversation', 'exam', 'business', 'travel']);
const ALLOWED_TONES = Object.freeze(['친근형', '신뢰형', '전문형', '목표달성형', '차분형', '코칭형']);
/** Google Sheets를 열면 위쪽 메뉴에 SEO 도구를 추가합니다. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SEO 도구')
    .addItem('최종키워드 생성', 'generateFinalKeywords')
    .addToUi();
}
/** 메뉴를 눌렀을 때 실행되는 시작 함수입니다. */
function generateFinalKeywords() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(3000)) {
    ui.alert('다른 생성 작업이 실행 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  try {
    spreadsheet.toast('사용할 데이터를 읽고 있습니다.', 'SEO 도구', 5);
    // 원본을 모두 검사한 뒤에만 final 시트를 변경합니다.
    const source = readSource_(spreadsheet);
    const result = buildRows_(source);
    const report = inspectFinalRows_(result);
    const finalSheet = requireSheet_(spreadsheet, APP.SHEETS.FINAL);
    rewriteFinal_(finalSheet, result);
    SpreadsheetApp.flush();
    const message = '최종키워드 ' + result.length.toLocaleString() + '개를 생성했습니다. ' +
      'description 중복 ' + report.descriptionDuplicates.toLocaleString() +
      '개 (' + report.descriptionDuplicateRate + '%)';
    spreadsheet.toast(message, 'SEO 도구', 8);
    ui.alert('완료', message, ui.ButtonSet.OK);
  } catch (error) {
    console.error(error);
    ui.alert('생성 오류', error.message || String(error), ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}
/** 네 원본 시트를 읽고 각 행을 이름이 있는 객체로 바꿉니다. */
function readSource_(spreadsheet) {
  const regions = readRegions_(requireSheet_(spreadsheet, APP.SHEETS.REGION));
  const targetRows = readEnabledRows_(
    requireSheet_(spreadsheet, APP.SHEETS.TARGET),
    APP.HEADERS.TARGET
  );
  const detailRows = readEnabledRows_(
    requireSheet_(spreadsheet, APP.SHEETS.DETAILS),
    APP.HEADERS.DETAILS
  );
  const ruleRows = readEnabledRows_(
    requireSheet_(spreadsheet, APP.SHEETS.RULES),
    APP.HEADERS.RULES
  );
  const targets = targetRows.map(function (row) {
    return {
      name: clean_(row.cells[1]),
      slug: makeSlugPart_(row.cells[2], 'target', row.number),
      type: clean_(row.cells[3]),
    };
  });
  const details = detailRows.map(function (row) {
    const detail = {
      name: clean_(row.cells[1]),
      slug: makeSlugPart_(row.cells[2], 'details', row.number),
      category: clean_(row.cells[3]),
      suffix: clean_(row.cells[4]),
      restriction: clean_(row.cells[5]),
      bodyTemplate: clean_(row.cells[6]),
      searchIntent: clean_(row.cells[7]),
      concern: clean_(row.cells[8]),
      lessonFocus: clean_(row.cells[9]),
      lessonMethod: clean_(row.cells[10]),
      lessonResult: clean_(row.cells[11]),
      tone: clean_(row.cells[12]),
      rowNumber: row.number,
    };
    validateDetailContent_(detail);
    return detail;
  });
  // 사용=Y인 rules 중 대표페이지=Y인 규칙만 선택합니다.
  const rules = ruleRows
    .filter(function (row) { return isY_(row.cells[3]); })
    .map(function (row) {
      const pattern = clean_(row.cells[2]);
      return {
        type: clean_(row.cells[1]),
        pattern: pattern,
        rowNumber: row.number,
        hasRegion: hasToken_(pattern, '지역'),
        hasTarget: hasToken_(pattern, '대상'),
        hasDetail: hasToken_(pattern, '세부키워드'),
      };
    });
  validateSource_(regions, targets, details, rules);
  return { regions: regions, targets: targets, details: details, rules: rules };
}
/** 모든 대표 규칙을 조합하고 중복을 제거합니다. */
function buildRows_(source) {
  const output = [];
  const keywordKeys = new Set();
  const slugKeys = new Set();
  source.rules.forEach(function (rule) {
    source.regions.forEach(function (region) {
      source.details.forEach(function (detail) {
        if (rule.hasTarget) {
          // {대상}이 있을 때만 target을 반복하고 대상제한을 적용합니다.
          source.targets.forEach(function (target) {
            if (!allowsTarget_(detail.restriction, target)) return;
            appendRow_(output, keywordKeys, slugKeys, rule, region, target, detail);
          });
        } else {
          // {대상}이 없으면 대상제한과 관계없이 대표페이지를 한 번만 만듭니다.
          appendRow_(output, keywordKeys, slugKeys, rule, region, null, detail);
        }
      });
    });
  });
  return output;
}
/** 키워드와 slug가 모두 처음 나온 값일 때 final 행을 추가합니다. */
function appendRow_(output, keywordKeys, slugKeys, rule, region, target, detail) {
  const keyword = fillPattern_(rule, region, target, detail);
  const slug = buildSlug_(rule, region, target, detail);
  const keywordKey = keyword.toLocaleLowerCase();
  const slugKey = slug.toLocaleLowerCase();
  if (keywordKeys.has(keywordKey) || slugKeys.has(slugKey)) return;
  keywordKeys.add(keywordKey);
  slugKeys.add(slugKey);
  const targetName = rule.hasTarget && target ? target.name : '';
  const summary = makeSummary_(region.province, region.name, targetName, detail);
  const description = makeDescription_(slug, region.province, region.name, targetName, detail);
  output.push([
    output.length + 1,
    APP.BASE_URL,
    slug,
    'publish',
    'ko',
    region.province,
    rule.hasRegion ? region.name : '',
    rule.hasDetail ? detail.name : '',
    targetName,
    keyword,
    keyword,
    description,
    detail.searchIntent,
    summary,
    detail.lessonFocus,
    detail.lessonMethod,
    detail.lessonResult,
    detail.tone,
    detail.bodyTemplate,
  ]);
}

/** details의 검색의도와 핵심고민을 합쳐 페이지 첫 답변으로 사용합니다. */
function makeSummary_(province, region, target, detail) {
  const service = [detail.name, detail.suffix].filter(Boolean).join(' ');
  const audience = [province, region, target, service].filter(Boolean).join(' ');
  return audience + ' 수업을 찾는 분을 위한 안내입니다. ' +
    '검색 목적은 “' + shortPhrase_(detail.searchIntent, 45) + '”이며, ' +
    '핵심 고민은 “' + shortPhrase_(detail.concern, 45) + '”입니다.';
}

/** 8개 패턴 중 slug가 지정하는 하나를 골라 80~150자 description을 만듭니다. */
function makeDescription_(slug, province, region, target, detail) {
  const service = [detail.name, detail.suffix].filter(Boolean).join(' ');
  const location = [province, region].filter(Boolean).join(' ');
  const toneStyle = toneStyle_(detail.tone);
  const context = {
    who: [location + '에서', target, service, '수업을 찾는 분을 위한', toneStyle, '안내입니다.']
      .filter(Boolean).join(' '),
    intent: labeledSentence_('검색 목적은', detail.searchIntent),
    concern: labeledSentence_('핵심 고민은', detail.concern),
    focus: labeledSentence_('수업 초점은', detail.lessonFocus),
    method: labeledSentence_('진행 방식은', detail.lessonMethod),
    result: labeledSentence_('기대 변화는', detail.lessonResult),
  };
  // 본문템플릿도 선택값에 포함해 같은 slug와 template은 항상 같은 결과를 냅니다.
  const patternIndex = stableHash_(slug + '|' + detail.bodyTemplate) % DESCRIPTION_PATTERNS.length;
  return fitDescription_(DESCRIPTION_PATTERNS[patternIndex](context), context.who, context.focus);
}

/** description 재료를 짧은 인용 문장으로 바꿔 조사가 어색하게 붙는 일을 막습니다. */
function labeledSentence_(label, value) {
  return label + ' “' + shortPhrase_(value, 32) + '”입니다.';
}

/** 긴 셀은 단어 경계에서 줄여 description이 지나치게 길어지지 않게 합니다. */
function shortPhrase_(value, maximumLength) {
  const clean = clean_(value).replace(/[.!?。]+$/, '').replace(/\s+/g, ' ');
  if (clean.length <= maximumLength) return clean;
  const sliced = clean.slice(0, maximumLength + 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > maximumLength * 0.55 ? sliced.slice(0, lastSpace) : clean.slice(0, maximumLength)) + '…';
}

/** 완성 문장을 보존하면서 description 길이를 80~150자로 맞춥니다. */
function fitDescription_(text, whoSentence, focusSentence) {
  let result = clean_(text).replace(/\s+/g, ' ');
  if (result.length > 150) {
    const sentences = result.match(/[^.!?。]+[.!?。]/g) || [result];
    result = '';
    sentences.forEach(function (sentence) {
      const candidate = (result + ' ' + clean_(sentence)).trim();
      if (candidate.length <= 150) result = candidate;
    });
  }
  if (result.length < 80) {
    result = (result + ' ' + focusSentence).trim();
  }
  if (result.length < 80) {
    result += ' 현재 수준을 확인한 뒤 필요한 내용을 순서대로 안내합니다.';
  }
  if (result.length > 150) {
    result = (whoSentence + ' ' + focusSentence).trim();
  }
  return result;
}

/** 톤 이름을 첫 문장의 자연스러운 표현으로 바꿉니다. */
function toneStyle_(tone) {
  const styles = {
    '친근형': '편안한',
    '신뢰형': '차분하고 분명한',
    '전문형': '체계적인',
    '목표달성형': '목표 중심',
    '차분형': '차분한',
    '코칭형': '함께 점검하는',
  };
  return styles[tone] || '차분한';
}

/** 문자열을 빠르게 숫자로 바꿔 slug별 패턴 번호를 고정합니다. */
function stableHash_(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** final 필수 콘텐츠가 모두 채워졌는지와 description 중복률을 확인합니다. */
function inspectFinalRows_(rows) {
  const requiredIndexes = [12, 13, 14, 15, 16, 17, 18];
  rows.forEach(function (row, index) {
    requiredIndexes.forEach(function (columnIndex) {
      if (!clean_(row[columnIndex])) {
        throw new Error('final 생성 결과 ' + (index + 2) + '행의 ' +
          APP.HEADERS.FINAL[columnIndex] + ' 값이 비어 있습니다.');
      }
    });
    if (row[11].length < 80 || row[11].length > 150) {
      throw new Error('final 생성 결과 ' + (index + 2) + '행 description 길이가 80~150자가 아닙니다.');
    }
  });
  const counts = {};
  rows.forEach(function (row) { counts[row[11]] = (counts[row[11]] || 0) + 1; });
  const duplicates = Object.keys(counts).reduce(function (sum, key) {
    return sum + Math.max(0, counts[key] - 1);
  }, 0);
  return {
    descriptionDuplicates: duplicates,
    descriptionDuplicateRate: rows.length ? (duplicates / rows.length * 100).toFixed(1) : '0.0',
  };
}

/** 활성 details 행의 H~M과 본문템플릿 값이 올바른지 먼저 검사합니다. */
function validateDetailContent_(detail) {
  const required = [
    ['본문템플릿(G)', detail.bodyTemplate], ['검색의도(H)', detail.searchIntent],
    ['핵심고민(I)', detail.concern], ['수업초점(J)', detail.lessonFocus],
    ['수업방식(K)', detail.lessonMethod], ['기대변화(L)', detail.lessonResult], ['톤(M)', detail.tone],
  ];
  required.forEach(function (item) {
    if (!item[1]) throw new Error('details 시트 ' + detail.rowNumber + '행의 ' + item[0] + ' 값이 비어 있습니다.');
  });
  const template = detail.bodyTemplate.toLowerCase();
  if (ALLOWED_TEMPLATES.indexOf(template) === -1) {
    throw new Error('details 시트 ' + detail.rowNumber + '행의 본문템플릿은 conversation, exam, business, travel 중 하나여야 합니다.');
  }
  detail.bodyTemplate = template;
  if (ALLOWED_TEMPLATES.indexOf(detail.searchIntent.toLowerCase()) !== -1) {
    throw new Error('details 시트 ' + detail.rowNumber + '행의 검색의도에 템플릿 이름이 들어 있습니다. H열과 G열을 확인해 주세요.');
  }
  if (ALLOWED_TONES.indexOf(detail.tone) === -1) {
    throw new Error('details 시트 ' + detail.rowNumber + '행의 톤 값을 확인해 주세요.');
  }
}
/** 패턴의 항목을 실제 한글 값으로 바꿉니다. */
function fillPattern_(rule, region, target, detail) {
  const replacements = {
    '지역': region.name,
    '대상': target ? target.name : '',
    '대상유형': target ? target.type : '',
    '세부키워드': detail.name,
    '분류': detail.category,
    '본문템플릿': detail.bodyTemplate,
  };
  let keyword = rule.pattern;
  Object.keys(replacements).forEach(function (name) {
    keyword = keyword.split('{' + name + '}').join(clean_(replacements[name]));
  });
  // 접미어가 있으면 앞에 공백을 자동 추가하고 없으면 완전히 제거합니다.
  const suffixText = detail.suffix ? ' ' + detail.suffix : '';
  keyword = keyword.split('{접미어}').join(suffixText);
  const unknown = keyword.match(/\{[^{}]+\}/);
  if (unknown) {
    throw new Error('rules 시트 ' + rule.rowNumber + '행에 알 수 없는 항목이 있습니다: ' + unknown[0]);
  }
  keyword = keyword.replace(/\s+/g, ' ').trim();
  if (!keyword) throw new Error('rules 시트 ' + rule.rowNumber + '행에서 빈 키워드가 생성되었습니다.');
  return keyword;
}
/** 패턴에 실제로 있는 세 주소 항목만 region-target-details 순서로 연결합니다. */
function buildSlug_(rule, region, target, detail) {
  const parts = [];
  if (rule.hasRegion) parts.push(region.slug);
  if (rule.hasTarget && target) parts.push(target.slug);
  if (rule.hasDetail) parts.push(detail.slug);
  if (!parts.length) {
    throw new Error(
      'rules 시트 ' + rule.rowNumber +
      '행 패턴에는 {지역}, {대상}, {세부키워드} 중 하나 이상이 필요합니다.'
    );
  }
  return parts.join('-');
}
/** details의 대상제한에 현재 대상 또는 대상유형이 포함되는지 확인합니다. */
function allowsTarget_(restriction, target) {
  const value = clean_(restriction);
  if (!value || value === '전체') return true;
  const allowed = value.split('|').map(clean_).filter(Boolean);
  return allowed.indexOf(target.name) !== -1 ||
    (target.type && allowed.indexOf(target.type) !== -1);
}
/** 새 5열 region 구조를 읽고, 이전 3열 구조도 계속 사용할 수 있게 합니다. */
function readRegions_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length || values[0].every(function (cell) { return clean_(cell) === ''; })) {
    throw new Error("'region' 시트가 비어 있습니다.");
  }
  const headers = values[0].map(clean_);
  const isNew = APP.HEADERS.REGION.every(function (header, index) {
    return headers[index] === header;
  });
  const isLegacy = APP.HEADERS.REGION_LEGACY.every(function (header, index) {
    return headers[index] === header;
  });
  if (!isNew && !isLegacy) {
    throw new Error(
      "region 시트 헤더는 '사용, 시도, 지역, 시도영문, 지역영문' 형식이어야 합니다. " +
      "이전 '사용, 지역, 영문주소' 형식도 지원합니다."
    );
  }
  return values.slice(1).map(function (cells, index) {
    return { cells: cells, number: index + 2 };
  }).filter(function (row) {
    return isY_(row.cells[0]);
  }).map(function (row) {
    if (isNew) {
      const province = clean_(row.cells[1]);
      const region = clean_(row.cells[2]);
      if (!province) throw new Error('region 시트 ' + row.number + '행의 시도가 비어 있습니다.');
      if (!region) throw new Error('region 시트 ' + row.number + '행의 지역이 비어 있습니다.');
      return {
        province: province,
        name: region,
        provinceSlug: makeSlugPart_(row.cells[3], 'region 시도영문', row.number),
        // 기존 URL 보존을 위해 slug에는 지역영문만 사용합니다.
        slug: makeSlugPart_(row.cells[4], 'region 지역영문', row.number),
      };
    }
    return {
      province: '',
      name: clean_(row.cells[1]),
      provinceSlug: '',
      slug: makeSlugPart_(row.cells[2], 'region', row.number),
    };
  });
}
/** 시트 헤더를 확인하고 사용=Y인 행만 실제 행 번호와 함께 반환합니다. */
function readEnabledRows_(sheet, expectedHeaders) {
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length || values[0].every(function (cell) { return clean_(cell) === ''; })) {
    throw new Error("'" + sheet.getName() + "' 시트가 비어 있습니다.");
  }
  expectedHeaders.forEach(function (expected, index) {
    const actual = clean_(values[0][index]);
    if (actual !== expected) {
      throw new Error(
        "'" + sheet.getName() + "' 시트 " + columnName_(index + 1) +
        '1은 ' + expected + '이어야 합니다. 현재 값: ' + (actual || '(빈값)')
      );
    }
  });
  return values.slice(1).map(function (cells, index) {
    return { cells: cells, number: index + 2 };
  }).filter(function (row) {
    return isY_(row.cells[0]);
  });
}
/** 입력 그룹과 규칙의 필수값을 final 삭제 전에 검사합니다. */
function validateSource_(regions, targets, details, rules) {
  if (!regions.length) throw new Error('region 시트에 사용=Y인 지역이 없습니다.');
  if (!details.length) throw new Error('details 시트에 사용=Y인 세부키워드가 없습니다.');
  if (!rules.length) throw new Error('rules 시트에 사용=Y이고 대표페이지=Y인 규칙이 없습니다.');
  if (rules.some(function (rule) { return rule.hasTarget; }) && !targets.length) {
    throw new Error('{대상}을 사용하는 규칙이 있지만 target 시트에 사용=Y인 대상이 없습니다.');
  }
  rules.forEach(function (rule) {
    if (!rule.type) throw new Error('rules 시트 ' + rule.rowNumber + '행의 조합유형이 비어 있습니다.');
    if (!rule.pattern) throw new Error('rules 시트 ' + rule.rowNumber + '행의 패턴이 비어 있습니다.');
  });
}
/** final 내용을 모두 비운 뒤 정해진 19개 열 순서로 새 결과를 기록합니다. */
function rewriteFinal_(sheet, rows) {
  const neededRows = rows.length + 1;
  const neededColumns = APP.HEADERS.FINAL.length;
  if (sheet.getMaxRows() < neededRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < neededColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), neededColumns - sheet.getMaxColumns());
  }
  sheet.clearContents();
  sheet.getRange(1, 1, 1, neededColumns).setValues([APP.HEADERS.FINAL]);
  if (rows.length) sheet.getRange(2, 1, rows.length, neededColumns).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, neededColumns)
    .setFontWeight('bold')
    .setBackground('#17324d')
    .setFontColor('#ffffff');
  sheet.autoResizeColumns(1, neededColumns);
  sheet.setColumnWidth(3, 240);
  sheet.setColumnWidth(9, 260);
  sheet.setColumnWidth(10, 260);
  sheet.setColumnWidth(11, 280);
  sheet.setColumnWidth(12, 420);
  sheet.setColumnWidths(13, 7, 260);
}
/** 이름이 정확히 일치하는 필수 시트를 가져옵니다. */
function requireSheet_(spreadsheet, name) {
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error("'" + name + "' 시트를 찾을 수 없습니다.");
  return sheet;
}
/** 영문주소를 소문자 하이픈 형식으로 정리합니다. */
function makeSlugPart_(value, sheetName, rowNumber) {
  const slug = clean_(value)
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new Error(sheetName + ' 시트 ' + rowNumber + '행의 영문주소를 확인해 주세요.');
  return slug;
}
/** 패턴에 {이름}이 정확히 있는지 확인합니다. */
function hasToken_(pattern, name) {
  return clean_(pattern).indexOf('{' + name + '}') !== -1;
}
/** 사용과 대표페이지의 Y 값을 대소문자 구분 없이 확인합니다. */
function isY_(value) {
  return clean_(value).toUpperCase() === 'Y';
}
/** 셀 값을 앞뒤 공백이 없는 문자열로 바꿉니다. */
function clean_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}
/** 오류 안내용 열 번호를 A, B, C 형식으로 바꿉니다. */
function columnName_(number) {
  let result = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    number = Math.floor((number - 1) / 26);
  }
  return result;
}
