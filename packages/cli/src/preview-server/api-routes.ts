import type {ApiHandler, ApiRoutes} from './api-types';
import {handleAddRender} from './routes/add-render';
import {subscribeToFileExistence} from './routes/subscribe-to-file-existence';
import {unsubscribeFromFileExistence} from './routes/unsubscribe-from-file-existence';

export const allApiRoutes: {
	[key in keyof ApiRoutes]: ApiHandler<
		ApiRoutes[key]['Request'],
		ApiRoutes[key]['Response']
	>;
} = {
	'/api/render': handleAddRender,
	'/api/unsubscribe-from-file-existence': unsubscribeFromFileExistence,
	'/api/subscribe-to-file-existence': subscribeToFileExistence,
};
