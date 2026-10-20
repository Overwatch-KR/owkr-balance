import { useQuery } from '@tanstack/react-query';

export function DraftAsset({ kind, id, name }: { kind: 'heroes' | 'maps'; id: string; name: string }) {
  const { data } = useQuery({ queryKey: ['draft-asset-manifest'], queryFn: async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}draft-assets/manifest.json`);
    if (!response.ok) throw new Error('이미지 목록을 불러오지 못했습니다.');
    return response.json() as Promise<{ assets: { kind: string; id: string; localPath: string }[] }>;
  }, staleTime: Infinity, retry: 1 });
  const source = data?.assets.find(asset => asset.kind === kind && asset.id === id)?.localPath;
  return <div className={`relative overflow-hidden bg-slate-900 ${kind === 'heroes' ? 'aspect-square' : 'aspect-video'}`}>
    <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-slate-500">{name}</span>
    {(source?.startsWith('/draft-assets/maps/') || source?.startsWith('/hero/')) && <img src={`${import.meta.env.BASE_URL}${source.slice(1)}`} alt="" loading="lazy"
      className="relative h-full w-full object-cover" onError={event => { event.currentTarget.style.visibility = 'hidden'; }} />}
  </div>;
}
