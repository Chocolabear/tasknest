// 실제 Supabase 서버 대신 임시 로컬 PostgreSQL(PGlite)에서 스키마와 RLS를 확인해.
// 네 클라우드 데이터에는 접속하지 않아.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const userA = '10000000-0000-4000-8000-000000000001';
const userB = '10000000-0000-4000-8000-000000000002';
const projectA = '20000000-0000-4000-8000-000000000001';
const projectB = '20000000-0000-4000-8000-000000000002';
const taskA = '30000000-0000-4000-8000-000000000001';
const taskB = '30000000-0000-4000-8000-000000000002';
const taskA2 = '30000000-0000-4000-8000-000000000003';
async function asUser(id) {
  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
}
async function mustReject(sql, values = []) {
  await assert.rejects(() => db.query(sql, values));
}

try {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to authenticated;
    grant usage on schema public to anon;
  `);
  await db.query('insert into auth.users(id) values ($1), ($2)', [userA, userB]);
  await db.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));

  await asUser(userA);
  await db.query('insert into public.projects(id, owner_id, name) values ($1, $2, $3)', [projectA, userA, 'A 프로젝트']);
  await db.query('insert into public.tasks(id, project_id, title) values ($1, $2, $3), ($4, $2, $5)', [taskA, projectA, 'A 작업', taskA2, 'A 작업 2']);
  await db.query('insert into public.task_links(project_id, source_id, target_id) values ($1, $2, $3)', [projectA, taskA, taskA2]);
  assert.equal((await db.query('select * from public.task_links')).rows.length, 1);
  await mustReject('insert into public.projects(owner_id, name) values ($1, $2)', [userB, '위조']);
  await mustReject('update public.projects set owner_id = $1 where id = $2', [userB, projectA]);
  await mustReject('insert into public.tasks(project_id, title, due_time) values ($1, $2, $3)', [projectA, '날짜 없는 시간', '12:00']);

  await asUser(userB);
  assert.equal((await db.query('select * from public.projects')).rows.length, 0);
  assert.equal((await db.query('select * from public.tasks')).rows.length, 0);
  assert.equal((await db.query('select * from public.task_links')).rows.length, 0);
  assert.equal((await db.query('update public.tasks set title = $1 where id = $2 returning id', ['변조', taskA])).rows.length, 0);
  assert.equal((await db.query('delete from public.projects where id = $1 returning id', [projectA])).rows.length, 0);
  await mustReject('insert into public.tasks(project_id, title) values ($1, $2)', [projectA, '침입']);
  await mustReject('insert into public.task_links(project_id, source_id, target_id) values ($1, $2, $3)', [projectA, taskA2, taskA]);
  await db.query('insert into public.projects(id, owner_id, name) values ($1, $2, $3)', [projectB, userB, 'B 프로젝트']);
  await db.query('insert into public.tasks(id, project_id, title) values ($1, $2, $3)', [taskB, projectB, 'B 작업']);

  await asUser(userA);
  await mustReject('insert into public.task_links(project_id, source_id, target_id) values ($1, $2, $3)', [projectA, taskA, taskB]);
  await mustReject('insert into public.task_links(project_id, source_id, target_id) values ($1, $2, $3)', [projectA, taskA, taskA]);
  await mustReject('insert into public.task_links(project_id, source_id, target_id) values ($1, $2, $3)', [projectA, taskA, taskA2]);
  await db.query('delete from public.tasks where id = $1', [taskA]);
  assert.equal((await db.query('select * from public.task_links')).rows.length, 0);
  await db.query('delete from public.projects where id = $1', [projectA]);
  assert.equal((await db.query('select * from public.tasks')).rows.length, 0);

  await db.exec('reset role; set role anon;');
  await mustReject('select * from public.projects');
  await mustReject('select * from public.tasks');
  await mustReject('select * from public.task_links');
  console.log('PASS: SQL 생성, 본인 CRUD, 타인 읽기/쓰기 차단, 익명 차단, 연결 제약, 연쇄 삭제');
} finally { await db.close(); }
