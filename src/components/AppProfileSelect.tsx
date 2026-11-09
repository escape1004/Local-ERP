import { Lock, Plus } from 'lucide-react';
import type { Profile } from '../types';
import { GateCard } from './GateCard';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from './ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { getProfileSwatchStyle, isDefaultProfile } from '../lib/profileAppearance';

interface AppProfileSelectProps {
  profiles: Profile[];
  isProfileBusy: boolean;
  profileError: string;
  onSelect: (profile: Profile) => void;
  onEdit: (profile: Profile) => void;
  onDelete: (profile: Profile) => void;
  onCreate: () => void;
}

export function AppProfileSelect({
  profiles,
  isProfileBusy,
  profileError,
  onSelect,
  onEdit,
  onDelete,
  onCreate,
}: AppProfileSelectProps) {
  return (
    <div className="h-full flex items-center justify-center bg-discord-bg p-6">
      <GateCard
        title="프로필 선택"
        description="프로필마다 카테고리와 대시보드 통계가 분리됩니다."
      >
        <div className="flex justify-center">
          <div className="w-fit max-w-full">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-10">
              {profiles.map((profile) => (
                <ContextMenu key={profile.id}>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      disabled={isProfileBusy}
                      onClick={() => onSelect(profile)}
                      className="group flex w-[132px] flex-col items-center text-center disabled:opacity-60"
                    >
                      <div
                        className="relative flex aspect-square w-full items-center justify-center rounded-xl text-4xl font-semibold text-white transition duration-200 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-white/70"
                        style={getProfileSwatchStyle(profile.avatarColor)}
                      >
                        {isDefaultProfile(profile) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/15">
                                <Lock className="h-4 w-4 text-white" />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[220px] bg-discord-sidebar text-discord-text border-gray-700">
                              기본 프로필입니다, 삭제가 불가능합니다.
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {profile.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="mt-4 text-xl font-medium text-gray-300 transition group-hover:text-white">
                        {profile.name}
                      </div>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => onEdit(profile)}>
                      프로필 수정
                    </ContextMenuItem>
                    <ContextMenuItem
                      disabled={isDefaultProfile(profile)}
                      className="text-red-400 focus:text-red-300 data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                      onClick={() => {
                        if (isDefaultProfile(profile)) return;
                        onDelete(profile);
                      }}
                    >
                      프로필 삭제
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              ))}

              <button
                type="button"
                onClick={onCreate}
                className="group flex w-[132px] flex-col items-center text-center"
              >
                <div className="flex aspect-square w-full items-center justify-center rounded-full bg-gray-500/80 text-black transition duration-200 group-hover:scale-[1.03] group-hover:bg-gray-400">
                  <Plus className="h-16 w-16" strokeWidth={2.5} />
                </div>
                <div className="mt-4 text-xl font-medium text-gray-400 transition group-hover:text-white">
                  프로필 추가
                </div>
              </button>
            </div>

            {profileError && <p className="mt-8 text-center text-sm text-red-400">{profileError}</p>}
          </div>
        </div>
      </GateCard>
    </div>
  );
}
