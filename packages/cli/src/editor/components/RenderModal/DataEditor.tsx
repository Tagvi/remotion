import React, {
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from 'react';
import type {AnyComposition} from 'remotion';
import {getInputProps, Internals} from 'remotion';
import type {z} from 'zod';
import {subscribeToEvent} from '../../../event-source';
import {StudioServerConnectionCtx} from '../../helpers/client-id';
import {BACKGROUND, BORDER_COLOR, LIGHT_TEXT} from '../../helpers/colors';
import {useZodIfPossible} from '../get-zod-if-possible';
import {Flex, Spacing} from '../layout';
import {ValidationMessage} from '../NewComposition/ValidationMessage';
import {sendErrorNotification} from '../Notifications/NotificationCenter';
import {
	canUpdateDefaultProps,
	updateDefaultProps,
} from '../RenderQueue/actions';
import type {SegmentedControlItem} from '../SegmentedControl';
import {SegmentedControl} from '../SegmentedControl';
import type {TypeCanSaveState} from './get-render-modal-warnings';
import {
	defaultTypeCanSaveState,
	getRenderModalWarnings,
} from './get-render-modal-warnings';
import {RenderModalJSONPropsEditor} from './RenderModalJSONPropsEditor';
import {extractEnumJsonPaths} from './SchemaEditor/extract-enum-json-paths';
import type {SerializedJSONWithCustomFields} from './SchemaEditor/input-props-serialization';
import {serializeJSONWithDate} from './SchemaEditor/input-props-serialization';
import {SchemaEditor} from './SchemaEditor/SchemaEditor';
import {
	NoDefaultProps,
	NoSchemaDefined,
	ZodNotInstalled,
} from './SchemaEditor/SchemaErrorMessages';
import {WarningIndicatorButton} from './WarningIndicatorButton';

type Mode = 'json' | 'schema';

type AllCompStates = {
	[key: string]: TypeCanSaveState;
};

export type State =
	| {
			str: string;
			value: Record<string, unknown>;
			validJSON: true;
			zodValidation: Zod.SafeParseReturnType<unknown, unknown>;
	  }
	| {
			str: string;
			validJSON: false;
			error: string;
	  };

export type PropsEditType = 'input-props' | 'default-props';

const errorExplanation: React.CSSProperties = {
	fontSize: 14,
	color: LIGHT_TEXT,
	fontFamily: 'sans-serif',
	lineHeight: 1.5,
};

const explainer: React.CSSProperties = {
	display: 'flex',
	flex: 1,
	flexDirection: 'column',
	padding: '0 12px',
	justifyContent: 'center',
	alignItems: 'center',
	textAlign: 'center',
};

const outer: React.CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	flex: 1,
	overflow: 'hidden',
	backgroundColor: BACKGROUND,
};

const controlContainer: React.CSSProperties = {
	flexDirection: 'column',
	display: 'flex',
	padding: 12,
	borderBottom: `1px solid ${BORDER_COLOR}`,
};

const tabWrapper: React.CSSProperties = {
	display: 'flex',
	marginBottom: '4px',
	flexDirection: 'row',
	alignItems: 'center',
};

const persistanceKey = 'remotion.show-render-modalwarning';

const getPersistedShowWarningState = () => {
	const val = localStorage.getItem(persistanceKey);
	if (!val) {
		return true;
	}

	return val === 'true';
};

const setPersistedShowWarningState = (val: boolean) => {
	localStorage.setItem(persistanceKey, String(Boolean(val)));
};

export const DataEditor: React.FC<{
	unresolvedComposition: AnyComposition;
	inputProps: Record<string, unknown>;
	setInputProps: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
	compact: boolean;
	mayShowSaveButton: boolean;
	propsEditType: PropsEditType;
}> = ({
	unresolvedComposition,
	inputProps,
	setInputProps,
	compact,
	mayShowSaveButton,
	propsEditType,
}) => {
	const [mode, setMode] = useState<Mode>('schema');
	const [valBeforeSafe, setValBeforeSafe] = useState<unknown>(inputProps);
	const [saving, setSaving] = useState(false);
	const [showWarning, setShowWarningWithoutPersistance] = useState<boolean>(
		() => getPersistedShowWarningState()
	);

	const inJSONEditor = mode === 'json';
	const serializedJSON: SerializedJSONWithCustomFields | null = useMemo(() => {
		if (!inJSONEditor) {
			return null;
		}

		const value = inputProps;
		return serializeJSONWithDate({
			data: value,
			indent: 2,
			staticBase: window.remotion_staticBase,
		});
	}, [inJSONEditor, inputProps]);

	const cliProps = getInputProps();
	const [canSaveDefaultPropsObjectState, setCanSaveDefaultProps] =
		useState<AllCompStates>({
			[unresolvedComposition.id]: defaultTypeCanSaveState,
		});

	const z = useZodIfPossible();

	const schema = useMemo(() => {
		if (!z) {
			return 'no-zod' as const;
		}

		if (!unresolvedComposition.schema) {
			return 'no-schema' as const;
		}

		if (!(typeof unresolvedComposition.schema.safeParse === 'function')) {
			throw new Error(
				'A value which is not a Zod schema was passed to `schema`'
			);
		}

		return unresolvedComposition.schema;
	}, [unresolvedComposition.schema, z]);

	const zodValidationResult = useMemo(() => {
		if (schema === 'no-zod') {
			return 'no-zod' as const;
		}

		if (schema === 'no-schema') {
			return 'no-schema' as const;
		}

		return schema.safeParse(inputProps);
	}, [inputProps, schema]);

	const setShowWarning: React.Dispatch<React.SetStateAction<boolean>> =
		useCallback((val) => {
			setShowWarningWithoutPersistance((prevVal) => {
				if (typeof val === 'boolean') {
					setPersistedShowWarningState(val);
					return val;
				}

				setPersistedShowWarningState(val(prevVal));
				return val(prevVal);
			});
		}, []);

	const canSaveDefaultProps = useMemo(() => {
		return canSaveDefaultPropsObjectState[unresolvedComposition.id]
			? canSaveDefaultPropsObjectState[unresolvedComposition.id]
			: defaultTypeCanSaveState;
	}, [canSaveDefaultPropsObjectState, unresolvedComposition.id]);

	const showSaveButton = mayShowSaveButton && canSaveDefaultProps.canUpdate;

	const {fastRefreshes} = useContext(Internals.NonceContext);

	const checkIfCanSaveDefaultProps = useCallback(async () => {
		try {
			const can = await canUpdateDefaultProps(unresolvedComposition.id);

			if (can.canUpdate) {
				setCanSaveDefaultProps((prevState) => ({
					...prevState,
					[unresolvedComposition.id]: {
						canUpdate: true,
					},
				}));
			} else {
				setCanSaveDefaultProps((prevState) => ({
					...prevState,
					[unresolvedComposition.id]: {
						canUpdate: false,
						reason: can.reason,
						determined: true,
					},
				}));
			}
		} catch (err) {
			setCanSaveDefaultProps((prevState) => ({
				...prevState,
				[unresolvedComposition.id]: {
					canUpdate: false,
					reason: (err as Error).message,
					determined: true,
				},
			}));
		}
	}, [unresolvedComposition.id]);

	useEffect(() => {
		checkIfCanSaveDefaultProps();
	}, [checkIfCanSaveDefaultProps]);

	useEffect(() => {
		const unsub = subscribeToEvent(
			'root-file-changed',
			checkIfCanSaveDefaultProps
		);

		return () => {
			unsub();
		};
	}, [checkIfCanSaveDefaultProps]);

	const modeItems = useMemo((): SegmentedControlItem[] => {
		return [
			{
				key: 'schema',
				label: 'Schema',
				onClick: () => {
					setMode('schema');
				},
				selected: mode === 'schema',
			},
			{
				key: 'json',
				label: 'JSON',
				onClick: () => {
					setMode('json');
				},
				selected: mode === 'json',
			},
		];
	}, [mode]);

	const onUpdate = useCallback(() => {
		if (schema === 'no-zod' || schema === 'no-schema' || z === null) {
			sendErrorNotification('Cannot update default props: No Zod schema');
			return;
		}

		setValBeforeSafe(inputProps);
		updateDefaultProps(
			unresolvedComposition.id,
			inputProps,
			extractEnumJsonPaths(schema, z, [])
		).then((response) => {
			if (!response.success) {
				sendErrorNotification(
					'Cannot update default props: ' + response.reason
				);
			}
		});
	}, [unresolvedComposition.id, inputProps, schema, z]);

	useEffect(() => {
		setSaving(false);
	}, [fastRefreshes]);

	const onSave = useCallback(
		(updater: (oldState: unknown) => unknown) => {
			if (schema === 'no-zod' || schema === 'no-schema' || z === null) {
				sendErrorNotification('Cannot update default props: No Zod schema');
				return;
			}

			setSaving(true);
			updateDefaultProps(
				unresolvedComposition.id,
				updater(unresolvedComposition.defaultProps),
				extractEnumJsonPaths(schema, z, [])
			)
				.then((response) => {
					if (!response.success) {
						console.log(response.stack);
						sendErrorNotification(
							`Cannot update default props: ${response.reason}. See console for more information.`
						);
					}
				})
				.catch((err) => {
					sendErrorNotification(`Cannot update default props: ${err.message}`);
					setSaving(false);
				});
		},
		[unresolvedComposition.defaultProps, unresolvedComposition.id, schema, z]
	);

	const connectionStatus = useContext(StudioServerConnectionCtx).type;

	const warnings = useMemo(() => {
		return getRenderModalWarnings({
			canSaveDefaultProps,
			cliProps,
			isCustomDateUsed: serializedJSON ? serializedJSON.customDateUsed : false,
			customFileUsed: serializedJSON ? serializedJSON.customFileUsed : false,
			inJSONEditor,
			propsEditType,
			jsMapUsed: serializedJSON ? serializedJSON.mapUsed : false,
			jsSetUsed: serializedJSON ? serializedJSON.setUsed : false,
		});
	}, [
		cliProps,
		canSaveDefaultProps,
		inJSONEditor,
		propsEditType,
		serializedJSON,
	]);

	if (connectionStatus === 'disconnected') {
		return (
			<div style={explainer}>
				<Spacing y={5} />
				<div style={errorExplanation}>
					The studio server has disconnected. Reconnect to edit the schema.
				</div>
				<Spacing y={2} block />
			</div>
		);
	}

	if (schema === 'no-zod') {
		return <ZodNotInstalled />;
	}

	if (schema === 'no-schema') {
		return <NoSchemaDefined />;
	}

	if (!z) {
		throw new Error('expected zod');
	}

	if (zodValidationResult === 'no-zod') {
		throw new Error('expected zod');
	}

	if (zodValidationResult === 'no-schema') {
		throw new Error('expected schema');
	}

	const def: z.ZodTypeDef = schema._def;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const typeName = (def as any).typeName as z.ZodFirstPartyTypeKind;

	if (typeName === z.ZodFirstPartyTypeKind.ZodAny) {
		return <NoSchemaDefined />;
	}

	if (!unresolvedComposition.defaultProps) {
		return <NoDefaultProps />;
	}

	return (
		<div style={outer}>
			<div style={controlContainer}>
				<div style={tabWrapper}>
					<SegmentedControl items={modeItems} needsWrapping={false} />
					<Flex />
					{warnings.length > 0 ? (
						<WarningIndicatorButton
							setShowWarning={setShowWarning}
							showWarning={showWarning}
							warningCount={warnings.length}
						/>
					) : null}
				</div>
				{showWarning && warnings.length > 0
					? warnings.map((warning) => (
							<React.Fragment key={warning}>
								<Spacing y={1} />
								<ValidationMessage
									message={warning}
									align="flex-start"
									type="warning"
								/>
							</React.Fragment>
					  ))
					: null}
			</div>

			{mode === 'schema' ? (
				<SchemaEditor
					value={inputProps}
					setValue={setInputProps}
					schema={schema}
					zodValidationResult={zodValidationResult}
					compact={compact}
					defaultProps={unresolvedComposition.defaultProps}
					onSave={onSave}
					showSaveButton={showSaveButton}
					saving={saving}
					saveDisabledByParent={!zodValidationResult.success}
				/>
			) : (
				<RenderModalJSONPropsEditor
					value={inputProps ?? {}}
					setValue={setInputProps}
					onSave={onUpdate}
					valBeforeSafe={valBeforeSafe}
					showSaveButton={showSaveButton}
					serializedJSON={serializedJSON}
					defaultProps={unresolvedComposition.defaultProps}
					schema={schema}
				/>
			)}
		</div>
	);
};
