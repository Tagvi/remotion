import type {LogLevel} from '@remotion/renderer';
import type {SVGProps} from 'react';
import React, {useCallback, useContext, useMemo} from 'react';
import type {TCompMetadata} from 'remotion';
import {getDefaultOutLocation} from '../../get-default-out-name';
import {RenderIcon} from '../icons/render';
import {ModalsContext} from '../state/modals';
import {InlineAction} from './InlineAction';

export const RenderButton: React.FC<{
	composition: TCompMetadata;
	visible: boolean;
}> = ({composition, visible}) => {
	const {setSelectedModal} = useContext(ModalsContext);

	const iconStyle: SVGProps<SVGSVGElement> = useMemo(() => {
		return {
			style: {
				height: 12,
			},
		};
	}, []);
	const isVideo = composition.durationInFrames > 1;
	const onClick: React.MouseEventHandler<HTMLAnchorElement> = useCallback(
		(e) => {
			e.stopPropagation();
			setSelectedModal({
				type: 'render',
				compositionId: composition.id,
				initialFrame: 0,
				initialImageFormat: isVideo ? 'jpeg' : 'png',
				// TODO: Determine defaults from config file
				initialQuality: window.remotion_renderDefaults?.quality ?? 80,
				initialScale: window.remotion_renderDefaults?.scale ?? 1,
				initialVerbose:
					(window.remotion_renderDefaults?.logLevel as LogLevel) === 'verbose',
				initialOutName: getDefaultOutLocation({
					compositionName: composition.id,
					defaultExtension: isVideo ? 'mp4' : 'png',
					type: 'asset',
				}),
				initialRenderType: isVideo ? 'video' : 'still',
				initialCodec: 'h264',
			});
		},
		[composition.id, isVideo, setSelectedModal]
	);

	if (!visible) {
		return null;
	}

	return (
		<InlineAction onClick={onClick}>
			<RenderIcon svgProps={iconStyle} />
		</InlineAction>
	);
};
