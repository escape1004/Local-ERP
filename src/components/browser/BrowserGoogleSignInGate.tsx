import React from 'react';
import { Button } from '../ui/button';
import type { BrowserExtensionInstallInfo } from '../../types';

type BrowserGoogleSignInGateProps = {
  info: BrowserExtensionInstallInfo | null;
  onOpenBrave: () => void;
  onOpenFirefox: () => void;
  onOpenBraveFolder: () => void;
  onOpenFirefoxFolder: () => void;
};

export function BrowserGoogleSignInGate({
  info,
  onOpenBrave,
  onOpenFirefox,
  onOpenBraveFolder,
  onOpenFirefoxFolder,
}: BrowserGoogleSignInGateProps) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-discord-bg/95 p-6">
      <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-discord-sidebar p-6 text-discord-text shadow-xl">
        <h2 className="text-base font-semibold text-white">앱 브라우저에서는 구글 로그인을 할 수 없습니다</h2>
        <p className="mt-3 text-sm leading-6 text-discord-muted">
          구글은 앱에 내장된 브라우저 로그인을 막습니다. 이 주소는 Brave 또는 Firefox에서 Local ERP 확장과 함께 여세요. 로그인은 그쪽에서 끝납니다.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button className="bg-discord-accent text-white hover:bg-blue-600" onClick={onOpenBrave} disabled={info?.braveInstalled === false}>
            Brave에서 열기
          </Button>
          <Button className="bg-discord-accent text-white hover:bg-blue-600" onClick={onOpenFirefox} disabled={info?.firefoxInstalled === false}>
            Firefox에서 열기
          </Button>
        </div>

        <div className="mt-6 space-y-3 text-sm leading-6 text-discord-muted">
          <p>
            <span className="font-medium text-discord-text">Brave:</span> 개발자 모드를 켠 뒤 압축 해제된 확장 로드에서 폴더를 선택합니다. 개발자 모드는 켜 둡니다.
          </p>
          <p>
            <span className="font-medium text-discord-text">Firefox:</span> about:debugging에서 임시 부가 기능으로 manifest.json을 로드합니다. Firefox를 끄면 다시 로드해야 합니다.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="ghost" className="hover:bg-discord-hover hover:text-discord-text" onClick={onOpenBraveFolder}>
            Brave 확장 폴더
          </Button>
          <Button variant="ghost" className="hover:bg-discord-hover hover:text-discord-text" onClick={onOpenFirefoxFolder}>
            Firefox 확장 폴더
          </Button>
        </div>
      </div>
    </div>
  );
}
