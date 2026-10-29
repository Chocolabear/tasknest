import { useState } from 'react';
import { Modal } from './Modal';

const colors = ['#647a55', '#ba785b', '#7b72ac', '#547fa2', '#b18c43'];
export function ProjectEditor({ initial, busy, onSave, onClose, error }: {
  initial?: string; busy: boolean; onSave: (name: string, color: string) => Promise<void>; onClose: () => void; error?: string;
}) {
  const [name, setName] = useState(initial ?? '');
  const [color, setColor] = useState(colors[0]);
  return <Modal title={initial ? '프로젝트 이름 수정' : '프로젝트 만들기'} error={error} onClose={() => { if (!busy) onClose(); }}>
    <form onSubmit={e => { e.preventDefault(); void onSave(name, color); }}>
      <fieldset disabled={busy}>
        <label>프로젝트 이름<input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="예: 개인 웹사이트 만들기" /></label>
        {!initial && <div className="color-options" role="group" aria-label="프로젝트 색상">{colors.map(c => <button key={c} type="button" aria-label={`색상 ${c}`} aria-pressed={c === color} className={c === color ? 'swatch selected' : 'swatch'} style={{ background: c }} onClick={() => setColor(c)} />)}</div>}
        <footer className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>취소</button><button className="button primary">{busy ? '저장 중…' : '저장하기'}</button></footer>
      </fieldset>
    </form>
  </Modal>;
}
