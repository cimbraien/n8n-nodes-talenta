import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IDataObject,
	NodeConnectionType,
	NodeApiError,
} from 'n8n-workflow';
import * as crypto from 'crypto-js';

const TALENTA_ACTION_VALUES = [
	'getAllEmployees',
	'getEmployeeById',
	'getOvertimeRequestList',
	'getOvertimeRequestDetailById',
] as const;
type TalentaActionValue = (typeof TALENTA_ACTION_VALUES)[number];

const TALENTA_ACTIONS = [
	{
		name: 'Get All Employees',
		value: 'getAllEmployees',
		method: 'GET',
		path: '/employee',
		pathVariables: [] as readonly string[],
		queryParams: ['limit', 'page', 'status'] as readonly string[],
		bodyParams: [] as readonly string[],
	},
	{
		name: 'Get Employee by ID',
		value: 'getEmployeeById',
		method: 'GET',
		path: '/employee/{id}',
		pathVariables: ['id'] as readonly string[],
		queryParams: [] as readonly string[],
		bodyParams: [] as readonly string[],
	},
	{
		name: 'Get Overtime Request List',
		value: 'getOvertimeRequestList',
		method: 'GET',
		path: '/overtime/{userId}/requests',
		pathVariables: ['userId'] as readonly string[],
		queryParams: ['limit', 'page', 'status', 'year', 'month'] as readonly string[],
		bodyParams: [] as readonly string[],
	},
	{
		name: 'Get Overtime Request Detail by ID',
		value: 'getOvertimeRequestDetailById',
		method: 'GET',
		path: '/overtime/{userId}/request-detail',
		pathVariables: ['userId'] as readonly string[],
		queryParams: ['requestId'] as readonly string[],
		bodyParams: [] as readonly string[],
	},
] as const;

async function makeRequest(
	context: IExecuteFunctions,
	action: (typeof TALENTA_ACTIONS)[number],
	credentials: IDataObject,
	itemIndex: number,
	pathVars: Record<string, string | number> = {},
	queryParams: Record<string, string | number> = {},
	bodyParams: Record<string, any> = {},
): Promise<{ response: any; url: string }> {
	let path = action.path as string;
	for (const varName of action.pathVariables) {
		const value = pathVars[varName];
		path = path.replace(`{${varName}}`, value !== undefined && value !== null ? String(value) : '');
	}
	const queryString =
		Object.entries(queryParams).length > 0
			? `?${Object.entries(queryParams)
				.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
				.join('&')}`
			: '';
	const baseUrl = String(credentials.baseUrl).replace(/\/+$/, '');
	const url = baseUrl + path + queryString;
	const basePath = baseUrl.replace(/^https?:\/\/[^/]+/, '');
	const fullPathForSignature = basePath + path + queryString;
	let body: IDataObject | undefined = undefined;
	if (action.bodyParams.length > 0 && Object.keys(bodyParams).length > 0) {
		body = {};
		for (const param of action.bodyParams) {
			if (bodyParams[param] !== undefined && bodyParams[param] !== '') {
				body[param] = bodyParams[param];
			}
		}
	}
	const requestLine = `${action.method} ${fullPathForSignature} HTTP/1.1`;
	const dateString = new Date().toUTCString();
	const digest = crypto.HmacSHA256(
		['date: ' + dateString, requestLine].join('\n'),
		String(credentials.clientSecret),
	);
	const signature = crypto.enc.Base64.stringify(digest);
	const hmacHeader = `hmac username="${credentials.clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;
	const headers: IDataObject = {
		Authorization: hmacHeader,
		Date: dateString,
		'Content-Type': 'application/json',
	};
	const options = {
		method: action.method,
		url,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		json: false,
	};
	try {
		const response = await context.helpers.httpRequestWithAuthentication.call(
			context,
			'talentaApi',
			options,
		);
		return { response, url };
	} catch (error) {
		const debugInfo = {
			requestLine,
			dateString,
			signature,
			hmacHeader,
			headers,
			url,
			body,
		};
		const errorWithDebug = Object.assign(
			error instanceof Error ? { message: error.message } : {},
			error,
			{ description: JSON.stringify(debugInfo, null, 2) },
		);
		throw new NodeApiError(context.getNode(), errorWithDebug, { itemIndex });
	}
}

export class TalentaRequest implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Talenta Request',
		name: 'talentaRequest',
		icon: 'file:talenta.svg',
		documentationUrl: 'https://documenter.getpostman.com/view/12246328/UVR5qp6v',
		group: ['transform'],
		version: 1,
		description: 'Make custom requests to the Talenta API with HMAC authentication',
		defaults: {
			name: 'Talenta Request',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'talentaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Action',
				name: 'action',
				type: 'options',
				options: TALENTA_ACTIONS.map((a) => ({
					name: a.name,
					value: a.value as TalentaActionValue,
				})),
				default: TALENTA_ACTIONS[0].value as TalentaActionValue,
			},
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter(
							(a) => a.queryParams.includes('limit') && a.queryParams.includes('page'),
						).map((a) => a.value as TalentaActionValue),
					},
				},
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.pathVariables.includes('id')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
			{
				displayName: 'User ID',
				name: 'userId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.pathVariables.includes('userId')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				description: 'Max number of results to return',
				typeOptions: {
					minValue: 1,
				},
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.queryParams.includes('limit')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
			{
				displayName: 'Page',
				name: 'page',
				type: 'number',
				default: 1,
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.queryParams.includes('page')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.queryParams.includes('status')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
			{
				displayName: 'Year',
				name: 'year',
				type: 'number',
				default: 2025,
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.queryParams.includes('year')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
			{
				displayName: 'Month',
				name: 'month',
				type: 'number',
				default: 7,
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.queryParams.includes('month')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
			{
				displayName: 'Request ID',
				name: 'requestId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						action: TALENTA_ACTIONS.filter((a) => a.queryParams.includes('requestId')).map(
							(a) => a.value as TalentaActionValue,
						),
					},
				},
			},
		],
	};

	async execute(this: TalentaRequest & IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('talentaApi');

		for (let i = 0; i < items.length; i++) {
			const actionValue = this.getNodeParameter('action', i) as string;
			const action = TALENTA_ACTIONS.find((a) => a.value === actionValue)!;

			const supportsPagination =
				action.queryParams.includes('limit') && action.queryParams.includes('page');
			const returnAll = supportsPagination
				? (this.getNodeParameter('returnAll', i, false) as boolean)
				: false;

			if (returnAll && supportsPagination) {
				let page = 1;
				let limit = this.getNodeParameter('limit', i, 50);
				if (limit === null || limit === undefined || isNaN(Number(limit))) {
					limit = 50;
				}
				limit = Number(limit);
				let allResults: any[] = [];
				while (true) {
					const pathVars = action.pathVariables.reduce(
						(acc, varName) => {
							const value = this.getNodeParameter(varName, i, undefined);
							if (typeof value === 'string' || typeof value === 'number') acc[varName] = value;
							return acc;
						},
						{} as Record<string, string | number>,
					);
					const queryParams = action.queryParams.reduce(
						(acc, param) => {
							let value: any =
								param === 'page'
									? page
									: param === 'limit'
										? limit
										: this.getNodeParameter(param, i, undefined);
							if (typeof value === 'string' || typeof value === 'number') acc[param] = value;
							return acc;
						},
						{} as Record<string, string | number>,
					);
					if (typeof limit === 'number' && !isNaN(limit)) {
						queryParams['limit'] = limit;
					}
					queryParams['page'] = page;
					const bodyParams = action.bodyParams.reduce(
						(acc, param) => {
							const value = this.getNodeParameter(param, i, undefined);
							if (typeof value === 'string' || typeof value === 'number') acc[param] = value;
							return acc;
						},
						{} as Record<string, string | number>,
					);
					const { response } = await makeRequest(
						this,
						action,
						credentials,
						i,
						pathVars,
						queryParams,
						bodyParams,
					);
					let pageResults: any[] = [];
					if (
						response &&
						typeof response === 'object' &&
						response.data &&
						typeof response.data === 'object'
					) {
						for (const value of Object.values(response.data)) {
							if (Array.isArray(value)) {
								pageResults = value;
								break;
							}
						}
					}
					if (pageResults.length === 0) break;
					allResults.push(...pageResults);
					if (response && response.pagination) {
						if (response.pagination.current_page === response.pagination.last_page) break;
					} else if (pageResults.length < limit) {
						break;
					}
					page++;
				}
				for (const row of allResults) {
					returnData.push({ json: row });
				}
				continue;
			}

			let path = action.path as string;
			for (const varName of action.pathVariables) {
				const value = this.getNodeParameter(varName, i, undefined);
				path = path.replace(
					`{${varName}}`,
					value !== undefined && value !== null ? String(value) : '',
				);
			}

			const queryParams: Record<string, string | number> = {};
			for (const param of action.queryParams) {
				let value = this.getNodeParameter(param, i, undefined);
				if (value === null || value === undefined) value = '';
				if (value !== '') {
					queryParams[param] = value as string | number;
				}
			}
			const queryString =
				Object.entries(queryParams).length > 0
					? `?${Object.entries(queryParams)
						.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
						.join('&')}`
					: '';
			const baseUrl = String(credentials.baseUrl).replace(/\/+$/, '');
			const url = baseUrl + path + queryString;

			const basePath = baseUrl.replace(/^https?:\/\/[^/]+/, '');
			const fullPathForSignature = basePath + path + queryString;

			let body: IDataObject | undefined = undefined;
			if (action.bodyParams.length > 0) {
				body = {};
				for (const param of action.bodyParams) {
					const value = this.getNodeParameter(param, i, undefined);
					if (value !== undefined && value !== '') {
						body[param] = value;
					}
				}
			}

			const requestLine = `${action.method} ${fullPathForSignature} HTTP/1.1`;
			const dateString = new Date().toUTCString();
			const digest = crypto.HmacSHA256(
				['date: ' + dateString, requestLine].join('\n'),
				String(credentials.clientSecret),
			);
			const signature = crypto.enc.Base64.stringify(digest);
			const hmacHeader = `hmac username="${credentials.clientId}", algorithm="hmac-sha256", headers="date request-line", signature="${signature}"`;

			const headers: IDataObject = {
				Authorization: hmacHeader,
				Date: dateString,
				'Content-Type': 'application/json',
			};

			let response;
			try {
				response = await makeRequest(this, action, credentials, i, {}, queryParams, body);
			} catch (error) {
				const debugInfo = {
					requestLine,
					dateString,
					signature,
					hmacHeader,
					headers,
					url,
					body,
				};
				const errorWithDebug = Object.assign(
					error instanceof Error ? { message: error.message } : {},
					error,
					{ description: JSON.stringify(debugInfo, null, 2) },
				);
				throw new NodeApiError(this.getNode(), errorWithDebug, { itemIndex: i });
			}
			let arrayResults: any[] = [];
			if (response && typeof response === 'object' && response.response && typeof response.response === 'object' && response.response.data && typeof response.response.data === 'object') {
				for (const value of Object.values(response.response.data)) {
					if (Array.isArray(value)) {
						arrayResults = value;
						break;
					}
				}
			}
			if (arrayResults.length > 0) {
				for (const row of arrayResults) {
					returnData.push({ json: row });
				}
			} else {
				returnData.push({ json: typeof response.response === 'string' ? { response: response.response } : response.response });
			}
		}

		return [returnData];
	}
}
