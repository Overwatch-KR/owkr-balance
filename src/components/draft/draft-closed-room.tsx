export function DraftClosedRoom({ reason = 'ROOM_CLOSED' }: { reason?: string }) {
  const missing = reason === 'ROOM_EXPIRED' || reason === 'INACTIVE_ROOM';
  return <section className="mx-auto max-w-lg border-y border-slate-700 py-10 text-center" role="status">
    <h2 className="text-xl font-semibold text-white">{missing ? '참여할 수 있는 내전 방이 없습니다' : '종료된 내전입니다'}</h2>
    <p className="mt-3 text-sm text-slate-400">{missing
      ? '존재하지 않거나 만료·비활성 상태인 방입니다. 운영자에게 새 공유 링크를 요청해 주세요.'
      : '이 방의 참여와 투표가 종료되었습니다. 새 내전은 운영자에게 새 공유 링크를 받아 참여해 주세요.'}</p>
  </section>;
}
