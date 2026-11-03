import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parsePeopleCsv } from '../test-support/parsePeopleCsv.js';
import { getNetWorthTier } from '../src/data/netWorth.js';
import { createSheetsValuesUrl, loadPeopleFromGoogleSheets } from '../src/services/googleSheets.js';
import { GoogleTokenSession, GOOGLE_SCOPES } from '../src/services/googleAuth.js';
import { getPeopleCardClass } from '../src/peopleCard.js';
import {
  DOUBLE_HELIX_TURNS,
  createLayoutTargets,
  getCameraFrame,
  getDoubleHelixPosition,
  getGridPosition,
  getTablePosition,
} from '../src/visualization.js';

const csvBytes = await readFile(new URL('./fixtures/people.csv', import.meta.url));
const people = parsePeopleCsv(csvBytes);

test('parses all 200 people in original CSV order', () => {
  assert.equal(people.length, 200);
  assert.deepEqual(people[0], {
    id: 1,
    name: 'Lee Siew Suan',
    photo: 'https://static.kasatria.com/pivot-img/photo/019.jpg',
    age: 25,
    country: 'CN',
    interest: 'Writing',
    netWorth: 251260.8,
  });
  people.forEach((person, index) => assert.equal(person.id, index + 1));
});

test('normalizes required fields and numeric values', () => {
  for (const person of people) {
    assert.equal(typeof person.id, 'number');
    assert.ok(person.name);
    assert.ok(person.photo);
    assert.ok(person.country);
    assert.ok(person.interest);
    assert.equal(typeof person.age, 'number');
    assert.equal(typeof person.netWorth, 'number');
    assert.ok(Number.isFinite(person.age));
    assert.ok(Number.isFinite(person.netWorth));
  }
});

test('classifies all CSV records into expected net worth tiers', () => {
  const counts = people.reduce((result, person) => {
    result[getNetWorthTier(person.netWorth)] += 1;
    return result;
  }, { red: 0, orange: 0, green: 0 });

  assert.deepEqual(counts, { red: 21, orange: 86, green: 93 });
});

test('classifies net worth boundaries correctly', () => {
  assert.equal(getNetWorthTier(99_999.99), 'red');
  assert.equal(getNetWorthTier(100_000), 'orange');
  assert.equal(getNetWorthTier(199_999.99), 'orange');
  assert.equal(getNetWorthTier(200_000), 'green');
});

test('creates a centered 20-column by 10-row table and 200 valid layout targets', () => {
  const tableCoordinates = Array.from({ length: 200 }, (_, index) => getTablePosition(index, 200));
  assert.equal(new Set(tableCoordinates.map(({ x }) => x)).size, 20);
  assert.equal(new Set(tableCoordinates.map(({ y }) => y)).size, 10);

  const targets = createLayoutTargets(200);
  for (const targetList of Object.values(targets)) {
    assert.equal(targetList.length, 200);
    for (const target of targetList) {
      assert.ok(Number.isFinite(target.position.x));
      assert.ok(Number.isFinite(target.position.y));
      assert.ok(Number.isFinite(target.position.z));
      assert.ok(Number.isFinite(target.rotation.x));
      assert.ok(Number.isFinite(target.rotation.y));
      assert.ok(Number.isFinite(target.rotation.z));
    }
  }
});

test('creates a centered 10 by 4 by 5 grid with unique positions', () => {
  const coordinates = Array.from({ length: 200 }, (_, index) => getGridPosition(index));
  assert.equal(new Set(coordinates.map(({ x }) => x)).size, 10);
  assert.equal(new Set(coordinates.map(({ y }) => y)).size, 4);
  assert.equal(new Set(coordinates.map(({ z }) => z)).size, 5);
  assert.equal(new Set(coordinates.map(({ x, y, z }) => `${x},${y},${z}`)).size, 200);
  assert.equal(coordinates.reduce((sum, point) => sum + point.x, 0), 0);
  assert.equal(coordinates.reduce((sum, point) => sum + point.y, 0), 0);
  assert.equal(coordinates.reduce((sum, point) => sum + point.z, 0), 0);
});

test('creates a three-turn double helix with two opposing 100-card strands', () => {
  const positions = Array.from({ length: 200 }, (_, index) => getDoubleHelixPosition(index, 200));
  assert.equal(positions.filter(({ strand }) => strand === 0).length, 100);
  assert.equal(positions.filter(({ strand }) => strand === 1).length, 100);

  for (let level = 0; level < 100; level += 1) {
    const first = positions[level * 2];
    const second = positions[level * 2 + 1];
    const firstRadius = Math.hypot(first.x, first.z);
    const secondRadius = Math.hypot(second.x, second.z);
    const normalizedDotProduct = (first.x * second.x + first.z * second.z) / (firstRadius * secondRadius);
    assert.ok(Math.abs(first.y - second.y) < 0.000001);
    assert.ok(Math.abs(firstRadius - secondRadius) < 0.000001);
    assert.ok(Math.abs(normalizedDotProduct + 1) < 0.000001);
  }

  const strandRotation = positions[198].angle - positions[0].angle;
  assert.ok(Math.abs(strandRotation - DOUBLE_HELIX_TURNS * Math.PI * 2) < 0.000001);
  assert.ok(DOUBLE_HELIX_TURNS >= 2.5 && DOUBLE_HELIX_TURNS <= 3);
  assert.equal(new Set(positions.map(({ x, y, z }) => `${x},${y},${z}`)).size, 200);

  const adjacentStrandDistance = Math.hypot(
    positions[2].x - positions[0].x,
    positions[2].y - positions[0].y,
    positions[2].z - positions[0].z,
  );
  assert.ok(adjacentStrandDistance > 300);
});

test('calculates a front-facing finite camera frame for the table', () => {
  const frame = getCameraFrame(createLayoutTargets(200).table, 40, 16 / 9);
  assert.ok(Number.isFinite(frame.position.z));
  assert.ok(frame.position.z > 0);
  assert.ok(Math.abs(frame.target.x) < 0.000001);
  assert.ok(Math.abs(frame.target.y) < 0.000001);
});

test('uses depth-revealing camera frames for helix and grid while preserving a straight table view', () => {
  const targets = createLayoutTargets(200);
  const tableFrame = getCameraFrame(targets.table, 40, 16 / 9, 'table');
  const helixFrame = getCameraFrame(targets.helix, 40, 16 / 9, 'helix');
  const gridFrame = getCameraFrame(targets.grid, 40, 16 / 9, 'grid');

  assert.ok(Math.abs(tableFrame.position.x - tableFrame.target.x) < 0.000001);
  assert.ok(Math.abs(tableFrame.position.y - tableFrame.target.y) < 0.000001);
  assert.notEqual(helixFrame.position.x, helixFrame.target.x);
  assert.notEqual(helixFrame.position.y, helixFrame.target.y);
  assert.notEqual(gridFrame.position.x, gridFrame.target.x);
  assert.notEqual(gridFrame.position.y, gridFrame.target.y);
});

test('maps net worth classifications to visible card tier classes', () => {
  assert.equal(getPeopleCardClass({ netWorth: 99_999 }), 'person-card tier-red');
  assert.equal(getPeopleCardClass({ netWorth: 100_000 }), 'person-card tier-orange');
  assert.equal(getPeopleCardClass({ netWorth: 200_000 }), 'person-card tier-green');
});

test('keeps all six people fields in the card implementation', async () => {
  const cardSource = await readFile(new URL('../src/peopleCard.js', import.meta.url), 'utf8');
  for (const field of ['person.name', 'person.photo', "'Age'", "'Country'", "'Interest'", "'Net Worth'"]) {
    assert.match(cardSource, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(cardSource, /image\.decoding = 'async'/);
  assert.match(cardSource, /title = person\.name/);
});

test('defines four layout buttons without a Reset View control', async () => {
  const [html, main] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/main.js', import.meta.url), 'utf8'),
  ]);
  for (const layout of ['table', 'sphere', 'helix', 'grid']) {
    assert.match(html, new RegExp(`data-layout="${layout}"`));
  }
  assert.match(main, /visualization\?\.transformTo\(button\.dataset\.layout\)/);
  assert.doesNotMatch(html, /RESET VIEW|reset-view/i);
  assert.doesNotMatch(main, /resetView|reset-view/);
  assert.match(main, /button\.setAttribute\('aria-pressed', String\(isActive\)\)/);
});

test('reports missing required headers', () => {
  const invalidCsv = new TextEncoder().encode('Name,Age\nAda,25\n');
  assert.throws(() => parsePeopleCsv(invalidCsv), /missing required column/i);
});

test('loads and normalizes 200 Google Sheets values with an authorization header', async () => {
  const values = [
    [' Name ', 'Photo', 'Age', 'Country', 'Interest', ' Net Worth '],
    ...people.map((person) => [
      person.name,
      person.photo,
      person.age,
      person.country,
      person.interest,
      person.netWorth,
    ]),
  ];
  let request;
  const records = await loadPeopleFromGoogleSheets({
    accessToken: 'test-access-token',
    spreadsheetId: 'spreadsheet-id',
    range: 'A:F',
    fetchImplementation: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ values }) };
    },
  });

  assert.equal(records.length, 200);
  assert.equal(records[0].netWorth, 251260.8);
  assert.equal(typeof records[0].age, 'number');
  assert.equal(request.options.headers.Authorization, 'Bearer test-access-token');
  assert.equal(request.url.includes('test-access-token'), false);
  assert.match(request.url, /valueRenderOption=FORMATTED_VALUE/);
});

test('supports formatted currency and numeric values from Google Sheets', async () => {
  const records = await loadPeopleFromGoogleSheets({
    accessToken: 'token',
    spreadsheetId: 'sheet',
    range: 'A:F',
    fetchImplementation: async () => ({
      ok: true,
      json: async () => ({ values: [
        ['Name', 'Photo', 'Age', 'Country', 'Interest', ' Net Worth '],
        ['Alex\u00a0Tan', 'https://example.test/photo.jpg', 27, 'MY', 'Reading', '$200,000.00'],
        [],
      ] }),
    }),
  });
  assert.deepEqual(records, [{
    id: 1,
    name: 'Alex Tan',
    photo: 'https://example.test/photo.jpg',
    age: 27,
    country: 'MY',
    interest: 'Reading',
    netWorth: 200000,
  }]);
});

test('returns useful Google Sheets API failures without a local CSV fallback', async () => {
  await assert.rejects(
    loadPeopleFromGoogleSheets({
      accessToken: 'token',
      spreadsheetId: 'sheet',
      range: 'A:F',
      fetchImplementation: async () => ({ ok: false, status: 403 }),
    }),
    /does not have permission/i,
  );

  let calls = 0;
  await assert.rejects(
    loadPeopleFromGoogleSheets({
      accessToken: 'token',
      spreadsheetId: 'sheet',
      range: 'A:F',
      fetchImplementation: async () => {
        calls += 1;
        throw new Error('offline');
      },
    }),
    /Unable to reach Google Sheets/i,
  );
  assert.equal(calls, 1);
});

test('explains insufficient Sheets scope instead of mislabeling it as spreadsheet sharing', async () => {
  await assert.rejects(
    loadPeopleFromGoogleSheets({
      accessToken: 'token',
      spreadsheetId: 'sheet',
      range: 'A:F',
      fetchImplementation: async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Request had insufficient authentication scopes.' } }),
      }),
    }),
    /read access was not granted/i,
  );
});

test('does not proceed with a Google token missing the Sheets readonly scope', async () => {
  let tokenClientConfig;
  let tokenRequestConfig;
  const google = {
    accounts: {
      oauth2: {
        initTokenClient: (config) => {
          tokenClientConfig = config;
          return { requestAccessToken: (configOverride) => { tokenRequestConfig = configOverride; } };
        },
        hasGrantedAllScopes: (response, scope) => response.scope.split(' ').includes(scope),
      },
    },
  };
  const session = new GoogleTokenSession({
    clientId: 'client-id',
    loadIdentityServices: async () => google,
  });
  await session.initialize();
  const authorization = session.requestAccessToken();
  tokenClientConfig.callback({ access_token: 'unscoped-token', scope: GOOGLE_SCOPES.slice(0, 3).join(' ') });

  await assert.rejects(authorization, /Google Sheets access was not granted/i);
  assert.equal(tokenRequestConfig.prompt, 'select_account consent');
});

test('validates Sheets URLs without putting tokens in the request URL', () => {
  const url = createSheetsValuesUrl('a spreadsheet/id', 'People A:F');
  assert.match(url, /a%20spreadsheet%2Fid/);
  assert.match(url, /People%20A%3AF/);
  assert.equal(url.includes('token'), false);
  assert.throws(() => createSheetsValuesUrl('', 'A:F'), /Spreadsheet ID is missing/);
  assert.throws(() => createSheetsValuesUrl('sheet', ''), /Sheet range is missing/);
});
