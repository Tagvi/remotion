import type {TRenderAsset} from 'remotion';
import {resolveAssetSrc} from '../resolve-asset-src';
import {convertAssetToFlattenedVolume} from './flatten-volume-array';
import type {Assets, MediaAsset, UnsafeAsset} from './types';
import {uncompressMediaAsset} from './types';

const areEqual = (a: TRenderAsset | UnsafeAsset, b: TRenderAsset) => {
	return a.id === b.id;
};

const findFrom = (target: TRenderAsset[], renderAsset: TRenderAsset) => {
	const index = target.findIndex((a) => areEqual(a, renderAsset));
	if (index === -1) {
		return false;
	}

	target.splice(index, 1);
	return true;
};

const copyAndDeduplicateAssets = (renderAssets: TRenderAsset[]) => {
	const deduplicated: TRenderAsset[] = [];
	for (const renderAsset of renderAssets) {
		if (!deduplicated.find((d) => d.id === renderAsset.id)) {
			deduplicated.push(renderAsset);
		}
	}

	return deduplicated;
};

export const calculateAssetPositions = (frames: TRenderAsset[][]): Assets => {
	const assets: UnsafeAsset[] = [];

	for (let frame = 0; frame < frames.length; frame++) {
		const prev = copyAndDeduplicateAssets(frames[frame - 1] ?? []);
		const current = copyAndDeduplicateAssets(frames[frame]);
		const next = copyAndDeduplicateAssets(frames[frame + 1] ?? []);

		for (const asset of current) {
			if (!findFrom(prev, asset)) {
				assets.push({
					src: resolveAssetSrc(uncompressMediaAsset(frames.flat(1), asset).src),
					type: asset.type,
					duration: null,
					id: asset.id,
					startInVideo: frame,
					trimLeft: asset.mediaFrame,
					volume: [],
					playbackRate: asset.playbackRate,
					allowAmplificationDuringRender: asset.allowAmplificationDuringRender,
				});
			}

			const found = assets.find(
				(a) => a.duration === null && areEqual(a, asset),
			);
			if (!found) throw new Error('something wrong');
			if (!findFrom(next, asset)) {
				// Duration calculation:
				// start 0, range 0-59:
				// 59 - 0 + 1 ==> 60 frames duration
				found.duration = frame - found.startInVideo + 1;
			}

			found.volume = [...found.volume, asset.volume];
		}
	}

	for (const asset of assets) {
		if (asset.duration === null) {
			throw new Error('duration is unexpectedly null');
		}
	}

	return (assets as MediaAsset[]).map((a) => convertAssetToFlattenedVolume(a));
};
