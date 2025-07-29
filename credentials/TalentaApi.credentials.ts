import {
	IconFile,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TalentaApi implements ICredentialType {
	name = 'talentaApi';
	displayName = 'Talenta API';
	icon = 'file:talenta.svg' as IconFile;
	documentationUrl = 'https://documenter.getpostman.com/view/12246328/UVR5qp6v';
	properties: INodeProperties[] = [
		{
			displayName: 'Client ID',
			name: 'clientId',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Client Secret',
			name: 'clientSecret',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
		},
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			options: [
				{ name: 'Production', value: 'production' },
				{ name: 'Sandbox', value: 'sandbox' },
			],
			default: 'production',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://api.mekari.com/v2/talenta/v2/',
			noDataExpression: true,
			displayOptions: {
				show: {
					environment: ['production'],
				},
			},
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://sandbox-api.mekari.com/v2/talenta/v2/',
			noDataExpression: true,
			displayOptions: {
				show: {
					environment: ['sandbox'],
				},
			},
		},
	];
}
