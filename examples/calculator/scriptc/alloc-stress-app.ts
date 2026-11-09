// scriptc 대규모 할당 스트레스 앱 — 러너(run-alloc-stress.mjs)가 이 파일을 네이티브
// 실행 파일로 컴파일해 반복 실행한다(nitro 55k 객체 할당 상당, 11/1 플랜 후속).
//
// 워크로드(라운드당, nitro parity 벤치와 동일한 flat-arena 트리 계약):
//   1. 5,000노드 트리를 script 런타임에 할당(대량 JS 객체 할당·GC 압력).
//   2. parityEcho — 엔진이 트리 전체를 역직렬화(Rust 객체 할당)하고 다시 직렬화해
//      돌려준다. 응답을 다시 파싱해 입력과 전 필드 일치를 단정한다(정답 보존).
//   3. parityStore — 엔진이 트리를 보유한다(엔진 측 지속 할당).
//   4. parityResident/parityIndexed — 보유 트리에 대한 계산 결과가 기대와 정확히
//      일치하는지 단정한다(DFS 전체 탐색 visited=N·인덱스 조회 visited=1).
//   5. parityFind(id:-1) — 전순회 미스가 visited=N 인지 단정한다.
//   6. 해제 — 1노드 대체 트리를 store 해 엔진이 5,000노드를 내려놓게 하고, 대체
//      직후 resident 조회가 과거 트리를 더 이상 찾지 못함을 단정한다.
// 11라운드 × 5,000노드 = 55,000 객체(nitro 벤치마크 55k 상당).
//
// RSS 상한: 라운드별로 /proc/self/statm(전체 프로세스 RSS — Node 의
// process.memoryUsage().rss 와 같은 소스)을 FFI read 로 직접 읽어 측정한다.
// scriptc 런타임의 process 객체는 memoryUsage 를 제공하지 않는다(실측 SC0001).
// 페이지 크기는 libc getpagesize 로 구한다(가정 없음). 상한 배수(runner 상수
// RSS_CEILING_MULTIPLIER)는 argv[2] 로 전달받아 시작 RSS 에 곱한 값과 비교하고,
// 초과 시 어느 라운드·어떤 측정치인지 진단과 함께 즉시 비영 종료한다.
//
// 사용법(러너 경유): alloc-stress <rssMultiplier> — argv[2] 필수.

import {
  unikit_mobile_init,
  unikit_ffi_invoke_json_into_len,
} from './scriptc-ffi.js';

// 러너가 생성하는 alloc-ffi.json 이 ffi.json 전체 descriptor에 추가하는
// libc 측정 심볼 4종(run-stress.mjs 의 fixture 함수 추가 방식과 동일한 확장).
export declare function alloc_open_readonly(path: string, flags: number): number;
export declare function alloc_read_buf(fd: number, buf: Uint8Array): bigint;
export declare function alloc_close_fd(fd: number): number;
export declare function alloc_page_size(): number;

const ROUNDS = 11;
const NODES_PER_ROUND = 5_000;
const TOTAL_OBJECTS = ROUNDS * NODES_PER_ROUND;
const TARGET_ID = NODES_PER_ROUND - 1; // DFS preorder 에서 마지막 방문 노드
const DECODER = new TextDecoder();
const OUTPUT = new Uint8Array(2 * 1_048_576); // echo 응답(트리 전체) + 봉투 여유
const FAILURE = 0xffff_ffff_ffff_ffffn;

type ArenaNode = {
  id: number;
  name: string;
  tag: string;
  note?: string;
  metadata: { owner: string; kind: string };
  children: number[];
};
// 엔진 응답 봉투 — serde 직렬화 특성상 result/error 는 null 로 온다(undefined 아님).
type Envelope = { ok: boolean; result: unknown; error: string | null };
// echo 응답 트리 — 엔진 측 Option<String> None 은 null 로 직렬화된다.
type EchoNode = {
  id: number;
  name: string;
  tag: string;
  note: string | null;
  metadata: { owner: string; kind: string };
  children: number[];
};

function fail(round: number, stage: string, detail: string): never {
  throw new Error(`round ${round}/${ROUNDS} ${stage}: ${detail}`);
}

function invoke(round: number, stage: string, payload: string): Envelope {
  const written = unikit_ffi_invoke_json_into_len(payload, OUTPUT);
  if (written === FAILURE || written === 0n || written > BigInt(OUTPUT.length))
    fail(round, stage, `engine invoke failed (written=${written})`);
  return JSON.parse(DECODER.decode(OUTPUT.subarray(0, Number(written)))) as Envelope;
}

function rssBytes(round: number, stage: string): number {
  const fd = alloc_open_readonly('/proc/self/statm', 0);
  if (fd < 0) fail(round, stage, 'cannot open /proc/self/statm');
  const buf = new Uint8Array(256);
  const read = alloc_read_buf(fd, buf);
  if (read <= 0n) fail(round, stage, 'cannot read /proc/self/statm');
  alloc_close_fd(fd);
  const fields = DECODER.decode(buf.subarray(0, Number(read))).trim().split(' ');
  const residentPages = Number(fields[1]);
  if (!Number.isFinite(residentPages) || residentPages <= 0)
    fail(round, stage, `implausible statm resident pages: ${fields[1]}`);
  return residentPages * alloc_page_size();
}

// nitro parity fixtures.ts 의 makeTree('balanced', count) 와 동일한 구성 —
// id 는 전순회(preorder) 생성 순이라 nodes[i].id === i 이고, children 순서대로의
// DFS 는 id 0..N-1 을 정확히 그 순서로 방문한다(기대값 근거).
function makeTree(round: number, count: number): { nodes: ArenaNode[] } {
  const nodes: ArenaNode[] = [];
  const append = (size: number): number => {
    const id = nodes.length;
    const node: ArenaNode = {
      id,
      name: `node-${round}-${id}`,
      tag: ['folder', 'file', 'link'][id % 3] as string,
      note: id % 2 ? `note-${round}-${id}` : undefined,
      metadata: { owner: `owner-${id % 7}`, kind: 'bench' },
      children: [],
    };
    nodes.push(node);
    if (size > 1) {
      const left = Math.floor((size - 1) / 2);
      if (left) node.children.push(append(left));
      node.children.push(append(size - 1 - left));
    }
    return id;
  };
  append(count);
  return { nodes };
}

// 엔진을 경유해 돌아온 트리가 입력과 전 필드 일치하는지 검사(정답 단언).
// 엔진 측 Option<String> None 은 null 로 직렬화되므로 undefined/null 을 동등 취급.
function assertEchoMatches(
  round: number,
  input: ArenaNode[],
  echoed: { nodes: EchoNode[] },
): void {
  if (echoed.nodes.length !== input.length)
    fail(round, 'echo', `node count ${echoed.nodes.length} != ${input.length}`);
  for (let index = 0; index < input.length; index += 1) {
    const want = input[index];
    const got = echoed.nodes[index];
    if (want === undefined || got === undefined) fail(round, 'echo', `node ${index} missing`);
    if (got.id !== want.id) fail(round, 'echo', `node ${index} id ${got.id} != ${want.id}`);
    if (got.name !== want.name) fail(round, 'echo', `node ${index} name ${got.name} != ${want.name}`);
    if (got.tag !== want.tag) fail(round, 'echo', `node ${index} tag ${got.tag} != ${want.tag}`);
    const wantNote = want.note ?? null;
    if (got.note !== wantNote)
      fail(round, 'echo', `node ${index} note ${got.note} != ${wantNote}`);
    if (got.metadata.owner !== want.metadata.owner)
      fail(round, 'echo', `node ${index} owner ${got.metadata.owner} != ${want.metadata.owner}`);
    if (got.metadata.kind !== want.metadata.kind)
      fail(round, 'echo', `node ${index} kind ${got.metadata.kind} != ${want.metadata.kind}`);
    if (got.children.length !== want.children.length)
      fail(round, 'echo', `node ${index} children ${got.children.length} != ${want.children.length}`);
    for (let child = 0; child < want.children.length; child += 1) {
      const wantChild = want.children[child];
      const gotChild = got.children[child];
      if (wantChild === undefined || gotChild === undefined || gotChild !== wantChild)
        fail(round, 'echo', `node ${index} child ${child} mismatch`);
    }
  }
}

function expectSearch(
  round: number,
  stage: string,
  envelope: Envelope,
  expected: { found: boolean; id: number; name: string; visited: number },
): void {
  if (!envelope.ok || envelope.result === null)
    fail(round, stage, `engine error: ${envelope.error}`);
  const got = envelope.result as {
    found: boolean;
    id: number;
    name: string;
    visited: number;
  };
  if (
    got.found !== expected.found ||
    got.id !== expected.id ||
    got.name !== expected.name ||
    got.visited !== expected.visited
  )
    fail(
      round,
      stage,
      `search ${JSON.stringify(got)} != ${JSON.stringify(expected)}`,
    );
}

function main(): void {
  const multiplier = Number(process.argv[2]);
  if (!Number.isFinite(multiplier) || multiplier < 1)
    throw new Error(`usage: alloc-stress <rssMultiplier>=<number >=1>, received '${process.argv[2]}'`);
  unikit_mobile_init();
  const startRss = rssBytes(0, 'startup');
  const ceilingBytes = startRss * multiplier;
  let peakRss = startRss;
  function sample(round: number, stage: string): number {
    const value = rssBytes(round, stage);
    if (value > peakRss) peakRss = value;
    if (value > ceilingBytes)
      fail(
        round,
        'rss-ceiling',
        `${stage} rss ${value} > ceiling ${ceilingBytes} (start ${startRss} × ${multiplier})`,
      );
    return value;
  }

  let echoOk = 0;
  let storeOk = 0;
  let residentOk = 0;
  let indexedOk = 0;
  let missOk = 0;
  let releaseOk = 0;
  const replacement = {
    nodes: [
      {
        id: 0,
        name: 'replacement',
        tag: 'file',
        metadata: { owner: 'owner-0', kind: 'bench' },
        children: [],
      },
    ],
  };

  for (let round = 1; round <= ROUNDS; round += 1) {
    // 1) 할당 — 라운드 시드가 이름에 포함돼 라운드별 데이터가 서로 다르다.
    const tree = makeTree(round, NODES_PER_ROUND);
    const allocRss = sample(round, 'after-alloc');

    // 2) 엔진 경유 echo — 전체 트리 왕복 + 전 필드 정답 단언.
    const echoEnvelope = invoke(
      round,
      'parityEcho',
      JSON.stringify({ command: 'parityEcho', args: tree }),
    );
    if (!echoEnvelope.ok || echoEnvelope.result === null)
      fail(round, 'parityEcho', `engine error: ${echoEnvelope.error}`);
    assertEchoMatches(round, tree.nodes, echoEnvelope.result as { nodes: EchoNode[] });
    const echoRss = sample(round, 'after-echo');

    // 3) 엔진 보유 할당 + 4) 보유 트리 계산 정답 단언.
    const storeEnvelope = invoke(
      round,
      'parityStore',
      JSON.stringify({ command: 'parityStore', args: tree }),
    );
    if (!storeEnvelope.ok || storeEnvelope.result === null)
      fail(round, 'parityStore', `engine error: ${storeEnvelope.error}`);
    const stored = storeEnvelope.result as { nodes: number };
    if (stored.nodes !== NODES_PER_ROUND)
      fail(round, 'parityStore', `stored ${stored.nodes} != ${NODES_PER_ROUND}`);
    storeOk += 1;
    expectSearch(
      round,
      'parityResident',
      invoke(round, 'parityResident', JSON.stringify({ command: 'parityResident', args: { id: TARGET_ID } })),
      { found: true, id: TARGET_ID, name: `node-${round}-${TARGET_ID}`, visited: NODES_PER_ROUND },
    );
    residentOk += 1;
    expectSearch(
      round,
      'parityIndexed',
      invoke(round, 'parityIndexed', JSON.stringify({ command: 'parityIndexed', args: { id: TARGET_ID } })),
      { found: true, id: TARGET_ID, name: `node-${round}-${TARGET_ID}`, visited: 1 },
    );
    indexedOk += 1;
    expectSearch(
      round,
      'parityFind-miss',
      invoke(
        round,
        'parityFind',
        JSON.stringify({ command: 'parityFind', args: { tree, id: -1 } }),
      ),
      { found: false, id: -1, name: '', visited: NODES_PER_ROUND },
    );
    missOk += 1;
    echoOk += 1;

    // 5) 해제 — 1노드 대체 store 로 엔진이 이전 트리를 내려놓는다. 이후 조회가
    // 과거 노드를 찾지 못하면 해제가 실제로 일어난 증거다.
    const releaseEnvelope = invoke(
      round,
      'parityStore-release',
      JSON.stringify({ command: 'parityStore', args: replacement }),
    );
    if (!releaseEnvelope.ok || releaseEnvelope.result === null)
      fail(round, 'parityStore-release', `engine error: ${releaseEnvelope.error}`);
    const released = releaseEnvelope.result as { nodes: number };
    if (released.nodes !== 1) fail(round, 'parityStore-release', `replacement stored ${released.nodes} != 1`);
    expectSearch(
      round,
      'parityResident-after-release',
      invoke(
        round,
        'parityResident-post-release',
        JSON.stringify({ command: 'parityResident', args: { id: TARGET_ID } }),
      ),
      { found: false, id: TARGET_ID, name: '', visited: 1 },
    );
    releaseOk += 1;
    const releaseRss = sample(round, 'after-release');
    console.log(
      `alloc round ${round}/${ROUNDS} objects=${NODES_PER_ROUND} echoNodes=${NODES_PER_ROUND} allocRss=${allocRss} echoRss=${echoRss} releaseRss=${releaseRss}`,
    );
  }
  const endRss = sample(ROUNDS, 'final');
  console.log(
    `scriptc alloc-stress PASS rounds=${ROUNDS} nodesPerRound=${NODES_PER_ROUND} objects=${TOTAL_OBJECTS} echoOk=${echoOk} storeOk=${storeOk} residentOk=${residentOk} indexedOk=${indexedOk} missOk=${missOk} releaseOk=${releaseOk}`,
  );
  console.log(
    `alloc rss start=${startRss} peak=${peakRss} end=${endRss} ceiling=${ceilingBytes} multiplier=${multiplier} headroomBytes=${ceilingBytes - peakRss}`,
  );
}

main();
