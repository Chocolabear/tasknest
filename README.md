# Tasknest — 프로젝트 투두리스트

프로젝트 탭, 마감 날짜·시간, 완료율, 할 일 연결도를 갖춘 개인용 웹앱이야.
React + TypeScript + Vite + React Flow + Supabase로 만들었어.

## 1. 일단 내 컴퓨터에서 실행하기

1. Node.js 22.12 이상을 설치해. Node.js 24 LTS를 사용해도 돼.
2. ZIP 압축을 풀고 VS Code에서 `tasknest` 폴더를 열어.
3. VS Code의 터미널에서 아래 명령어를 실행해.

```bash
npm install
npm run dev
```

터미널에 표시되는 `http://localhost:5173` 주소를 브라우저로 열어.
포트가 이미 사용 중이면 터미널에 다른 포트가 표시될 수 있어.

**이 단계에서는 회원가입 없이 바로 써볼 수 있어.** 프로젝트를 만들고 할 일을 추가해봐.
Supabase 환경변수 둘 다 없으면 자동으로 로컬 모드로 실행돼.

- 로컬 모드는 지금 브라우저의 localStorage에 저장해.
- 브라우저를 닫았다 열어도 남지만, 사이트 데이터 삭제·시크릿 모드 종료 시 사라질 수 있어.
- 다른 기기·브라우저·다른 접속 주소와 공유되지 않아.
- 클라우드 설정 후 로컬 데이터를 자동 업로드하지 않아. 처음엔 테스트 데이터만 넣는 걸 추천해.
- 상단 다운로드 버튼으로 현재 불러온 프로젝트·할 일·연결을 JSON으로 내려받을 수 있어.
- JSON 내보내기는 백업 자료 보관용이야. 앱 안의 JSON 복원/가져오기는 아직 구현하지 않았어.

## 2. Supabase에 DB 만들기

기기 간 공유를 쓰려면 이 단계부터 설정해.

1. <https://supabase.com/> 에서 로그인하고 새 프로젝트를 만들어.
2. 데이터베이스 비밀번호를 설정하고 프로젝트 준비가 끝날 때까지 기다려.
3. 프로젝트 대시보드의 **SQL Editor**에서 새 쿼리를 열어.
4. 이 폴더의 **`supabase/schema.sql` 전체 내용**을 복사해 붙여넣고 실행해.
5. 테이블 목록에서 `projects`, `tasks`, `task_links`가 생성됐는지 확인해.

SQL은 새 프로젝트에서 한 번 실행하는 용도야. 데이터 삭제 명령은 없고, 이미 같은 테이블이 있다면 중복 생성 오류가 나.
전체 SQL이 트랜잭션이라 도중 오류가 생기면 전체가 롤백돼. 기존 테이블을 무작정 지우지 말고 오류를 확인해.

RLS 정책을 포함해서 **로그인한 사용자 본인의 프로젝트만 조회·수정**하도록 구성했어.
할 일이나 연결에 다른 프로젝트 ID를 넣는 경우에도 DB에서 소유권을 검사해.
서로 다른 프로젝트의 할 일을 연결하는 것은 복합 외래키로 차단해.

## 3. 내 코드와 Supabase 연결하기

프로젝트 대시보드의 Connect 또는 프로젝트 설정/API Keys에서 아래 두 값을 확인해.

- **Project URL**: `https://프로젝트ID.supabase.co` 형태
- **Publishable Key**: `sb_publishable_...` 형태. 기존 프로젝트라면 공개 `anon` 키도 지원해.

`tasknest` 최상위 폴더, 즉 `package.json` 옆에 **`.env.local`** 파일을 만들어.
아래 예시의 값을 실제 값으로 바꿔 넣어.

```dotenv
VITE_SUPABASE_URL=https://프로젝트ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_실제공개키
```

`.env.example` 파일을 복사하고 이름을 바꿔도 돼.

macOS/Linux:

```bash
cp .env.example .env.local
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

실행 중인 터미널에서 `Ctrl+C`를 누른 뒤 다시 실행해.

```bash
npm run dev
```

이제 로그인 화면이 나오면 연결 설정이 적용된 거야.
URL/키 둘 중 하나만 입력하면 설정 오류 화면을 보여줘. 실수로 로컬 모드에 저장하는 걸 막기 위한 처리야.

**`secret` 또는 `service_role` 키는 넣으면 안 돼.** `VITE_` 환경변수는 브라우저에 전달되는 공개 값이야.
보안은 공개 키를 숨기는 대신 로그인과 DB의 RLS 정책으로 보장하는 구조야.

## 4. 회원가입과 이메일 인증 설정하기

Supabase 대시보드의 Authentication 설정에서:

1. 이메일/비밀번호 로그인이 활성화되어 있는지 확인해.
2. URL Configuration의 Site URL을 개발 중에는 `http://localhost:5173`으로 설정해.
3. Redirect URLs에도 `http://localhost:5173`을 허용해.
4. 앱 로그인 화면에서 회원가입하고 인증 메일이 오면 링크를 눌러.
5. 같은 이메일과 비밀번호로 로그인해 프로젝트를 만들어봐.

코드의 비밀번호 최소 길이는 8자야. Supabase에서 더 강한 정책을 설정했다면 그 조건도 만족해야 해.
이메일 인증을 켠 상태라면 인증 전 로그인은 실패할 수 있어.
메일이 안 오면 스팸함과 Supabase 인증 메일 발송 제한·SMTP 설정을 확인해.
Supabase의 기본 메일 서비스에는 발송 제한이 있으니 잦은 가입/재설정 요청을 반복하지 마.

앱에서 비밀번호 찾기를 누르면 재설정 메일을 보내고, 메일 링크로 돌아오면 새 비밀번호를 정할 수 있어.
다른 사람이 가입할 필요 없는 개인용이라면, 네 계정을 만든 뒤 대시보드에서 신규 가입 허용을 꺼도 돼.

## 5. GitHub에 올리기

GitHub에서 빈 저장소를 만들고 터미널에서 실행해.
아래 URL은 네 저장소 주소로 바꿔.

```bash
git init
git add .
git commit -m "Build Tasknest project todo app"
git branch -M main
git remote add origin https://github.com/네계정/tasknest.git
git push -u origin main
```

`.gitignore`에 `.env.local`, `node_modules`, `dist`가 포함되어 있어.
ZIP에도 실제 인증 키나 비밀번호는 들어 있지 않아.

## 6. Vercel에 배포하기

1. <https://vercel.com/> 에서 GitHub 계정으로 로그인해.
2. 새 프로젝트를 만들고 방금 만든 GitHub 저장소를 가져와.
3. Root Directory는 `package.json`이 있는 폴더로 지정해. 저장소 루트에 넣었다면 기본값 그대로야.
4. Framework는 **Vite**, Build Command는 **`npm run build`**, Output Directory는 **`dist`**로 설정해.
5. Environment Variables에 아래 두 변수를 추가해.

| 이름 | 값 |
|---|---|
| `VITE_SUPABASE_URL` | 실제 Supabase Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 실제 공개 Publishable Key 또는 anon 키 |

6. Deploy를 눌러. 배포가 완료되면 발급된 `https://...vercel.app` 주소로 접속해.
7. Supabase Authentication의 Site URL을 **실제 배포 주소**로 바꿔.
8. Redirect URLs에도 실제 배포 주소를 추가해. 로컬 개발도 계속할 거면 localhost 허용 항목은 남겨둬.

환경변수를 나중에 수정했다면 **다시 배포해야** 프론트엔드 빌드에 반영돼.
환경변수 없이 배포하면 로컬 모드로 작동하므로 상단에 **클라우드 저장**이 표시되는지 확인해.
페이지 주소를 안다고 남의 투두가 열리지는 않아. 로그인과 RLS를 거쳐 본인 데이터만 불러와.

이제 모바일·맥북·데스크톱에서 같은 배포 주소를 열고 같은 계정으로 로그인하면 돼.
네 컴퓨터는 꺼도 돼. 별도 도메인을 구매하지 않고 발급된 주소를 써도 돼.

## 7. 사용법

### 프로젝트와 할 일

- 프로젝트 추가 → 이름과 색상 지정 → 탭으로 전환.
- 프로젝트 제목 옆 연필로 이름 변경, 휴지통으로 삭제.
- 할 일 추가 → 제목, 메모, 마감 날짜·시간 입력.
- 제목을 누르거나 연필을 누르면 수정할 수 있어.
- 삭제 버튼은 확인 창을 보여줘. 프로젝트 삭제 시 소속 할 일과 연결도 같이 삭제돼.

### 완료율

`완료한 할 일 수 / 프로젝트 전체 할 일 수 × 100`을 반올림해 표시해.
빈 프로젝트는 0%. 완료 체크를 풀면 내려가고, 새 할 일을 추가하면 분모가 늘어날 수 있어.
이번 버전에는 분류 전용 노드/하위 할 일은 없어. 화면의 모든 할 일 카드는 각각 한 번씩 계산돼.

### 연결도

- 목록/연결도는 동일한 할 일을 보여줘.
- 카드를 드래그하면 놓은 위치가 저장돼.
- 카드 오른쪽 점에서 다른 카드 왼쪽 점으로 이어서 연결해.
- 모바일에서는 **연결 관리** 버튼으로 출발·도착 할 일을 선택하면 편해.
- 연결 관리에서는 기존 연결을 삭제할 수 있어.
- 캔버스에서 연결선을 누르면 삭제 확인 창이 나와.
- 연결은 생각이나 관계를 나타내는 선이야. 선후 작업 완료를 강제하지 않아.
- 자기 자신으로 연결하거나 같은 방향의 연결을 중복 생성할 수 없어.
- 개념 간 관계 표현용이라 순환 연결은 허용해.
- 왼쪽 아래 컨트롤로 확대·축소·전체 보기 가능. 확대 비율/화면 중심은 저장하지 않고 다시 열면 전체를 맞춰 보여줘.

### 마감일

- 날짜 없이 마감 없음 / 날짜만 / 날짜+시간을 지원해.
- **한국 시간(Asia/Seoul, UTC+09:00)**을 기준으로 저장된 날짜·시간을 해석해.
- 날짜만 지정하면 그날 23:59:59.999까지로 계산해.
- 설정한 시점이 지난 미완료 할 일에는 지연 표시가 나와.
- 지연 표시는 렌더링 시 갱신돼. 화면을 켜둔 채 시각이 지났다면 새로고침해 확인해.
- 푸시 알림/이메일 마감 알림은 이번 버전에 포함하지 않았어.

### 기기 간 갱신

변경할 때 서버에 저장하고 새로 불러와. 다른 기기에서 바꾼 내용은:

- 페이지를 새로 열 때
- 다른 앱/탭에서 돌아와 화면에 다시 포커스가 잡힐 때
- 상단 새로고침 버튼을 누를 때

불러와. **두 기기 화면이 즉시 동시에 바뀌는 실시간 구독 방식은 아니야.**
네트워크가 끊기면 클라우드 저장 요청은 오류를 보여주며, 자동 오프라인 큐는 제공하지 않아.
서로 다른 필드 수정은 각각의 필드만 업데이트하고, 같은 필드를 동시에 수정하면 나중 요청이 반영돼.
로컬 모드의 여러 탭 동시 편집은 충돌을 해결하지 않으므로 한 탭에서 편집하는 걸 추천해.

## 8. 코드 구조

| 파일 | 역할 |
|---|---|
| `src/App.tsx` | 로그인 상태, 프로젝트 탭, 목록, 진행률, 저장 흐름 |
| `src/components/TaskMap.tsx` | 연결도 노드, 연결선, 위치 이동 |
| `src/components/TaskEditor.tsx` | 할 일 입력·수정 폼 |
| `src/components/ProjectEditor.tsx` | 프로젝트 입력·수정 폼 |
| `src/components/Auth.tsx` | 가입·로그인·비밀번호 재설정 |
| `src/components/Modal.tsx` | 키보드 포커스를 가두는 native dialog |
| `src/repository.ts` | Supabase/로컬 저장소 CRUD |
| `src/domain.ts` | 완료율·마감 계산·입력 검증 |
| `src/supabase.ts` | 환경변수와 Supabase 클라이언트 |
| `src/types.ts` | 데이터 타입 |
| `src/styles.css` | 반응형 스타일 |
| `supabase/schema.sql` | 테이블·외래키·RLS 권한 설정 |
| `tests/` | 도메인·로컬 저장소·화면 흐름 테스트 |
| `vercel.json` | Vercel 빌드 설정 |

## 9. 검증 명령어

```bash
npm test
npm run test:db
npm run build
```

로컬 테스트는 완료율, 날짜/시간 마감 경계, 잘못된 입력, 할 일·연결 저장, 연쇄 삭제,
프로젝트 생성부터 완료 체크·재접속 복원 흐름을 검증해.
별도의 `npm run test:db`는 임시 로컬 PostgreSQL(PGlite)에서 SQL 실행·RLS 소유권·익명 차단·외래키·연쇄 삭제를 확인해. 클라우드 DB에 접속하거나 수정하지 않아.
실제 Supabase 계정의 로그인/메일/서버 저장은 네 환경변수 설정 후 아래 항목을 직접 확인해줘.

1. 계정 A에서 프로젝트와 할 일 두 개 생성.
2. 연결도에서 연결·위치 이동 후 새로고침해 복원 확인.
3. 다른 기기에서 A로 로그인해 동일 데이터 확인.
4. 할 일 완료 체크 후 원래 기기로 돌아와 진행률 확인.
5. 계정 B에서는 A의 프로젝트가 보이지 않는지 확인.
6. 로그아웃 상태에서 DB 테이블 조회가 허용되지 않는지 확인.

모바일/맥북/Windows 실기기 브라우저 검증과 실제 클라우드 접속 검증은 아직 하지 않았어.

## 10. 자주 생기는 문제

| 증상 | 확인할 내용 |
|---|---|
| `npm` 명령어를 찾을 수 없음 | Node.js 설치 후 터미널/VS Code를 다시 열어 |
| 로그인 화면 대신 로컬 모드 | `.env.local` 이름과 두 변수 이름 확인 후 개발 서버 재시작 |
| 배포했는데 로컬 모드 | Vercel 환경변수에 둘 다 입력하고 Redeploy |
| `relation ... does not exist` | Supabase SQL 전체를 실행했는지, URL이 같은 프로젝트인지 확인 |
| `Invalid API key` | Publishable Key/anon 키가 해당 Project URL의 키인지 확인 |
| 이메일 미인증 로그인 실패 | 인증 메일 링크 클릭, Site URL/Redirect URLs 확인 |
| 저장 시 권한 오류 | 로그인 상태, schema.sql RLS 정책, 본인 프로젝트 ID 확인 |
| 다른 기기에서 변경이 안 보임 | 동일 계정·동일 배포 주소인지 확인하고 상단 새로고침 |
| 오랫동안 안 쓰다 접속 오류 | Supabase 무료 프로젝트 일시정지 여부를 확인 |

무료 플랜의 정책과 한도는 서비스에서 바뀔 수 있어. 이 코드는 유료 기능 없이 구성했지만
서비스 가입·요금제 선택·사용량 관리는 각 서비스 대시보드에서 확인해.

## 공식 문서

- Vite: <https://vite.dev/guide/>
- React Flow: <https://reactflow.dev/learn>
- Supabase React 시작: <https://supabase.com/docs/guides/getting-started/quickstarts/reactjs>
- Supabase 인증: <https://supabase.com/docs/guides/auth/passwords>
- Supabase RLS: <https://supabase.com/docs/guides/database/postgres/row-level-security>
- Vercel Vite 배포: <https://vercel.com/docs/frameworks/frontend/vite>
