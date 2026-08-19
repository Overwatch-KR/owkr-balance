/**
 * @description Discord 관리자 로그인에서 처리하는 정보와 이용 정책을 별도 페이지로 안내한다.
 */
export function DiscordLoginPolicyPage() {
    return (
        <main className="min-h-screen bg-[#080a0f] px-5 py-10 text-slate-200 sm:py-16">
            <article className="mx-auto max-w-2xl">
                <a
                    href="/"
                    className="inline-flex min-h-10 items-center rounded-md px-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
                >
                    <span aria-hidden="true">←</span>
                    <span className="ml-2">로그인 화면으로 돌아가기</span>
                </a>

                <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-black/30 sm:p-9">
                    <header>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
                            OWKR 관리자 인증
                        </p>
                        <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                            Discord 로그인 정보 이용 안내
                        </h1>
                        <p className="mt-4 text-sm leading-7 text-slate-400">
                            OWKR Balance는 등록된 관리자만 접근할 수 있도록 확인하고, 별도 계정
                            생성 없이 간편하게 로그인하기 위해 Discord 인증을 사용합니다.
                        </p>
                    </header>

                    <section aria-labelledby="login-purpose-title" className="mt-8 border-t border-white/10 pt-7">
                        <h2 id="login-purpose-title" className="text-base font-semibold text-white">
                            이용 목적
                        </h2>
                        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-400">
                            <li>사전에 등록된 관리자만 서비스에 접근할 수 있도록 확인</li>
                            <li>별도 관리자 계정 생성 없이 Discord 계정으로 간편 로그인</li>
                            <li>유저 시트에 마지막으로 정보를 수정한 관리자 이름을 자동 기록</li>
                        </ul>
                    </section>

                    <section aria-labelledby="login-data-title" className="mt-8 border-t border-white/10 pt-7">
                        <h2 id="login-data-title" className="text-base font-semibold text-white">
                            처리하는 정보
                        </h2>
                        <dl className="mt-4 space-y-5 text-sm leading-6">
                            <div>
                                <dt className="font-medium text-slate-200">Discord 사용자 ID</dt>
                                <dd className="mt-1 text-slate-400">
                                    사전에 등록된 관리자 목록과 대조해 접근 권한을 확인합니다.
                                </dd>
                            </div>
                            <div>
                                <dt className="font-medium text-slate-200">사용자명 · 표시 이름</dt>
                                <dd className="mt-1 text-slate-400">
                                    로그인 사용자를 표시하고 유저 시트의 마지막 수정자 이름을 기록합니다.
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section aria-labelledby="login-scope-title" className="mt-8 border-t border-white/10 pt-7">
                        <h2 id="login-scope-title" className="text-base font-semibold text-white">
                            권한 범위와 보관
                        </h2>
                        <div className="mt-3 space-y-3 text-sm leading-6 text-slate-400">
                            <p>
                                Discord OAuth의 기본 프로필 확인 권한만 요청합니다. 이메일, 서버
                                목록, 멤버 목록, 메시지는 조회하지 않습니다.
                            </p>
                            <p>
                                OAuth 액세스 토큰은 저장하지 않습니다. 로그인 세션은 1주일 후
                                만료되며 로그아웃하면 즉시 종료됩니다.
                            </p>
                            <p>
                                유저 시트에 기록된 마지막 수정자 이름은 해당 항목이 다시 수정되거나
                                삭제될 때까지 유지됩니다.
                            </p>
                        </div>
                    </section>
                </div>
            </article>
        </main>
    );
}
