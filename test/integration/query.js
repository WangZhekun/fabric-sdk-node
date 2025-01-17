/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// This is an end to end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario

// IMPORTANT ------>>>>> MUST RUN e2e.js FIRST
// AND set environment variables indicated in the comments
// at the end of the invoke-transaction run.

'use strict';

const {Utils:utils} = require('fabric-common');
const logger = utils.getLogger('query');

const tape = require('tape');
const _test = require('tape-promise').default;
const test = _test(tape);

const path = require('path');
const util = require('util');
const e2eUtils = require('./e2e/e2eUtils.js');
const fs = require('fs');

const testUtil = require('./util.js');
const Client = require('fabric-client');
const Peer = require('fabric-client/lib/Peer.js');
const Orderer = require('fabric-client/lib/Orderer.js');
const BlockDecoder = require('fabric-client/lib/BlockDecoder.js');

const client = new Client();
const channel_id = testUtil.END2END.channel;
const channel = client.newChannel(channel_id);

const org = 'org1';
let orgName;

const e2e = testUtil.END2END;
let ORGS, peer0;

let tx_id = null;

let data;
test('  ---->>>>> Query channel working <<<<<-----', (t) => {
	Client.addConfigFile(path.join(__dirname, 'e2e', 'config.json'));
	ORGS = Client.getConfigSetting('test-network');
	orgName = ORGS[org].name;
	const caRootsPath = ORGS.orderer.tls_cacerts;
	data = fs.readFileSync(path.join(__dirname, 'e2e', caRootsPath));

	const caroots = Buffer.from(data).toString();
	let tlsInfo = null;
	let bcInfo = null;
	let tx_block = null;

	utils.setConfigSetting('key-value-store', 'fabric-common/lib/impl/FileKeyValueStore.js');
	const cryptoSuite = Client.newCryptoSuite();
	cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
	client.setCryptoSuite(cryptoSuite);

	return e2eUtils.tlsEnroll(org).then((enrollment) => {
		t.pass('Successfully retrieved TLS certificate');
		tlsInfo = enrollment;
		client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);
		return Client.newDefaultKeyValueStore({path: testUtil.storePathForOrg(orgName)});
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');

		channel.addOrderer(
			new Orderer(
				ORGS.orderer.url,
				{
					'pem': caroots,
					'clientCert': tlsInfo.certificate,
					'clientKey': tlsInfo.key,
					'ssl-target-name-override': ORGS.orderer['server-hostname']
				}
			)
		);

		data = fs.readFileSync(path.join(__dirname, 'e2e', ORGS[org].peer1.tls_cacerts));
		peer0 = new Peer(
			ORGS[org].peer1.requests,
			{
				pem: Buffer.from(data).toString(),
				'clientCert': tlsInfo.certificate,
				'clientKey': tlsInfo.key,
				'ssl-target-name-override': ORGS[org].peer1['server-hostname']
			});
		data = fs.readFileSync(path.join(__dirname, 'e2e', ORGS.org2.peer1.tls_cacerts));
		const peer1 = new Peer(
			ORGS.org2.peer1.requests,
			{
				pem: Buffer.from(data).toString(),
				'clientCert': tlsInfo.certificate,
				'clientKey': tlsInfo.key,
				'ssl-target-name-override': ORGS.org2.peer1['server-hostname']
			});

		channel.addPeer(peer0);
		channel.addPeer(peer1);

		// read the config block from the peer for the channel
		// and initialize the verify MSPs based on the participating
		// organizations
		return channel.initialize();
	}).then(() => {
		t.pass('Successfully initialized channel');
		// use default primary peer
		// send query
		return channel.queryBlock(0);
	}).then((block) => {
		logger.debug(' Channel getBlock() returned block number=%s', block.header.number);
		t.equal(block.header.number.toString(), '0', 'checking query results are correct that we got zero block back');
		t.equal(block.data.data[0].payload.data.config.channel_group.groups.Orderer.groups.OrdererMSP.values.MSP.value.config.name, 'OrdererMSP', 'checking query results are correct that we got the correct orderer MSP name');
		t.equal(block.data.data[0].payload.data.config.channel_group.groups.Application.groups.Org2MSP.policies.Writers.policy.type, 'SIGNATURE', 'checking query results are correct that we got the correct policy type');
		t.equal(block.data.data[0].payload.data.config.channel_group.groups.Application.policies.Writers.policy.value.rule, 'ANY', 'checking query results are correct that we got the correct policy rule');
		t.equal(block.data.data[0].payload.data.config.channel_group.policies.Admins.mod_policy, 'Admins', 'checking query results are correct that we got the correct mod policy name');
		return channel.queryBlock(1);
	}).then((block) => {
		logger.debug(' Channel getBlock() returned block number=%s', block.header.number);
		t.equal(block.header.number.toString(), '1', 'checking query results are correct that we got a transaction block back');
		tx_id = utils.getConfigSetting('E2E_TX_ID');
		logger.debug('getConfigSetting("E2E_TX_ID") = %s', tx_id);
		if (!tx_id) {
			logger.error('   Did you set the E2E_TX_ID environment variable after running invoke-transaction.js ?');
			throw new Error('Could not get tx_id from ConfigSetting "E2E_TX_ID"');
		} else {
			t.pass('Got tx_id from ConfigSetting "E2E_TX_ID"');
			// send query
			return channel.queryTransaction(tx_id, peer0); // assumes the end-to-end has run first
		}
	}).then((processed_transaction) => {
		t.equals('mychannel', processed_transaction.transactionEnvelope.payload.header.channel_header.channel_id,
			'test for header channel name');
		t.equals('Org2MSP', processed_transaction.transactionEnvelope.payload.header.signature_header.creator.Mspid,
			'test for header channel mspid in identity');
		t.equals('Org1MSP', processed_transaction.transactionEnvelope.payload.data.actions['0']
			.payload.action.endorsements['0'].endorser.Mspid,
		'test for endorser mspid in identity');
		t.equals('Org2MSP', processed_transaction.transactionEnvelope.payload.data.actions['0'].header.creator.Mspid,
			'test for creator mspid in identity');
		t.equals(200, processed_transaction.transactionEnvelope.payload.data.actions['0'].payload.action
			.proposal_response_payload.extension.response.status,
		'test for transation status');
		t.equals(0, processed_transaction.transactionEnvelope.payload.data.actions['0']
			.payload.action.proposal_response_payload.extension.results.data_model,
		'test for data model value');
		t.equals('a', processed_transaction.transactionEnvelope.payload.data.actions['0']
			.payload.action.proposal_response_payload.extension.results.ns_rwset['1']
			.rwset.writes['0'].key,
		'test for write set key value');

		// the "target peer" must be a peer in the same org as the app
		// which in this case is "peer0"
		// send query
		return channel.queryInfo(peer0);
	}).then((blockchainInfo) => {
		t.pass('got back blockchain info ');
		logger.debug(' Channel queryInfo() returned block height=' + blockchainInfo.height);
		logger.debug(' Channel queryInfo() returned block previousBlockHash=' + blockchainInfo.previousBlockHash);
		logger.debug(' Channel queryInfo() returned block currentBlockHash=' + blockchainInfo.currentBlockHash);
		bcInfo = blockchainInfo;
		const block_hash = blockchainInfo.currentBlockHash;
		// send query
		return channel.queryBlockByHash(block_hash, peer0);
	}).then((block) => {
		logger.debug(' Channel queryBlockByHash() returned block number=%s', block.header.number);
		t.pass('got back block number ' + block.header.number);
		return channel.queryBlockByTxID(tx_id);
	}).then((block) => {
		t.pass(util.format('Should find block[%s] by txid: %s', block.header.number, tx_id));
		tx_block = block.header.number;

		// query block skipping decoder
		return channel.queryBlock(1, null, null, true);
	}).then((binaryBlock) => {
		if (!(binaryBlock instanceof Buffer)) {
			t.fail('queryBlock(skipDecode = true) did not return a binary block');
		} else {
			const block = BlockDecoder.decode(binaryBlock);
			if (block && block.header && block.header.number) {
				t.pass('queryBlock(skipDecode = true) returned a decodable binary block');
				t.equals(block.header.number, '1', 'block number is correct');
			} else {
				t.fail('queryBlock(skipDecode = true) did not return decodable binary block');
			}
		}

		const block_hash = bcInfo.currentBlockHash;
		// query by hash skipping decoder
		return channel.queryBlockByHash(block_hash, peer0, null, true);
	}).then((binaryBlock) => {
		if (!(binaryBlock instanceof Buffer)) {
			t.fail('queryBlockByHash(skipDecode = true) did not return a binary block');
		} else {
			const block = BlockDecoder.decode(binaryBlock);
			if (block && block.header && block.header.number) {
				t.pass('queryBlockByHash(skipDecode = true) returned a decodable binary block');
				t.equals(block.header.number, (bcInfo.height - 1).toString(), 'block number is correct');
			} else {
				t.fail('queryBlockByHash(skipDecode = true) did not return decodable binary block');
			}
		}

		// query by txid skipping decoder
		return channel.queryBlockByTxID(tx_id, null, null, true);
	}).then((binaryBlock) => {
		if (!(binaryBlock instanceof Buffer)) {
			t.fail('queryBlockByTxID(skipDecode = true) did not return a binary block');
		} else {
			const block = BlockDecoder.decode(binaryBlock);
			if (block && block.header && block.header.number) {
				t.pass('queryBlockByTxID(skipDecode = true) returned a decodable binary block');
				t.equals(block.header.number, tx_block, 'block number is correct');
			} else {
				t.fail('queryBlockByTxID(skipDecode = true) did not return decodable binary block');
			}
		}

		// query tx skipping decoder
		return channel.queryTransaction(tx_id, peer0, null, true); // assumes the end-to-end has run first
	}).then((binaryTx) => {
		if (!(binaryTx instanceof Buffer)) {
			t.fail('queryTransaction(skipDecode = true) did not return a binary transaction');
		} else {
			const tx = BlockDecoder.decodeTransaction(binaryTx);
			if (tx && tx.transactionEnvelope && tx.transactionEnvelope.payload &&
				tx.transactionEnvelope.payload.header && tx.transactionEnvelope.payload.header.channel_header) {
				t.pass(util.format('queryTransaction(skipDecode = true) returned binary transaction which is decodable'));
				t.equals(tx_id, tx.transactionEnvelope.payload.header.channel_header.tx_id, 'tx_id is correct');
			} else {
				t.fail('queryTransaction did not return a decodable binary transaction');
			}
		}
		t.end();
	}).catch((err) => {
		t.fail('Query channel failed:%j', err);
		t.end();
	});
});

test('  ---->>>>> Query channel failing: GetBlockByNumber <<<<<-----', (t) => {

	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');
		// send query
		return channel.queryBlock(9999999); // should not find it
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then(() => {
		t.fail('Should not have found a block');
		t.end();
	}, (err) => {
		t.pass(util.format('Did not find a block with this number : %j', err));
		t.end();
	}).catch((err) => {
		t.fail('Failed to query with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('  ---->>>>> Query channel failing: GetBlockByTxID <<<<<-----', (t) => {

	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then(() => {
		return channel.queryBlockByTxID(client.newTransactionID()); // should not find this txid
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then(() => {
		t.fail('Should not have found a block');
		t.end();
	}, (err) => {
		t.pass(util.format('Did not find a block with this txid : %j', err));
		t.end();
	}).catch((err) => {
		t.fail('Failed to query with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('  ---->>>>> Query channel failing: GetTransactionByID <<<<<-----', (t) => {
	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');
		// send query
		return channel.queryTransaction('99999'); // assumes the end-to-end has run first
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then(() => {
		t.fail('Should not have found a transaction with this ID');
		t.end();
	}, (err) => {
		t.pass('Did not find a transaction ::' + err);
		t.end();
	}).catch((err) => {
		t.fail('Failed to query with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('  ---->>>>> Query channel failing: GetChannelInfo <<<<<-----', (t) => {

	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');
		// send query
		channel._name = 'dummy';
		return channel.queryInfo();
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then(() => {
		t.fail('Should not have found channel info');
		t.end();
	}, (err) => {
		t.pass(util.format('Did not find channel info : %j', err));
		t.end();
	}).catch((err) => {
		t.fail('Failed to query with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('  ---->>>>> Query channel failing: GetBlockByHash <<<<<-----', (t) => {
	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);
		return testUtil.getSubmitter(client, t, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');
		// send query
		channel._name = channel_id; // put it back
		return channel.queryBlockByHash(Buffer.from('dummy'));
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then(() => {
		t.fail('Should not have found block data');
		t.end();
	}, (err) => {
		t.pass(util.format('Did not find block data : %j', err));
		t.end();
	}).catch((err) => {
		t.fail('Failed to query with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('  ---->>>>> Query Installed Chaincodes working <<<<<-----', (t) => {
	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);

		// get the peer org's admin required to query installed chaincodes
		return testUtil.getSubmitter(client, t, true /* get peer org admin */, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');
		// send query
		return client.queryInstalledChaincodes(peer0);
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then((response) => {
		logger.debug('<<< installed chaincodes >>>');
		let found = false;

		for (let i = 0; i < response.chaincodes.length; i++) {
			logger.debug('name: ' + response.chaincodes[i].name +
				', version: ' + response.chaincodes[i].version +
				', path: ' + response.chaincodes[i].path);

			if (response.chaincodes[i].name === e2e.chaincodeId &&
				response.chaincodes[i].version === e2e.chaincodeVersion &&
				response.chaincodes[i].path === testUtil.CHAINCODE_PATH) {
				found = true;
			}
		}
		if (found) {
			t.pass('queryInstalledChaincodes - found match for e2e');
			t.end();
		} else {
			t.fail('queryInstalledChaincodes - did not find match for e2e');
			t.end();
		}
	}, (err) => {
		t.fail('Failed to send queryInstalledChaincodes due to error: ' + err.stack ? err.stack : err);
		t.end();
	}).catch((err) => {
		t.fail('Failed to queryInstalledChaincodes with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('  ---->>>>> Query Instantiated Chaincodes working <<<<<-----', (t) => {
	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);

		// get the peer org's admin required to query instantiated chaincodes
		return testUtil.getSubmitter(client, t, true /* get peer org admin */, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');
		// send query
		return channel.queryInstantiatedChaincodes();
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then((response) => {
		logger.debug('<<< instantiated chaincodes >>>');
		let found = false;
		for (let i = 0; i < response.chaincodes.length; i++) {
			logger.debug('name: ' + response.chaincodes[i].name +
				', version: ' + response.chaincodes[i].version +
				', path: ' + response.chaincodes[i].path);

			if (response.chaincodes[i].name === e2e.chaincodeId &&
				response.chaincodes[i].version === 'v1' &&
				response.chaincodes[i].path === testUtil.CHAINCODE_UPGRADE_PATH) {
				found = true;
			}
		}
		if (found) {
			t.pass('queryInstantiatedChaincodes - found match for e2e');
			t.end();
		} else {
			t.fail('queryInstantiatedChaincodes - did not find match for e2e');
			t.end();
		}
	}, (err) => {
		t.fail('Failed to send queryInstantiatedChaincodes due to error: ' + err.stack ? err.stack : err);
		t.end();
	}).catch((err) => {
		t.fail('Failed to queryInstantiatedChaincodes with error:' + err.stack ? err.stack : err);
		t.end();
	});
});

test('  ---->>>>> Query Channels working <<<<<-----', (t) => {
	return Client.newDefaultKeyValueStore({
		path: testUtil.storePathForOrg(orgName)
	}).then((store) => {
		client.setStateStore(store);

		return testUtil.getSubmitter(client, t, org);
	}).then(() => {
		t.pass('Successfully enrolled user \'admin\'');

		// send query
		return client.queryChannels(peer0);
	}, (err) => {
		t.fail('Failed to enroll user: ' + err.stack ? err.stack : err);
		t.end();
	}).then((response) => {
		logger.debug('<<< channels >>>');
		for (let i = 0; i < response.channels.length; i++) {
			logger.debug('channel id: ' + response.channels[i].channel_id);
		}
		if (response.channels[0].channel_id === channel_id) {
			t.pass('queryChannels matches e2e');
			t.end();
		} else {
			t.fail('queryChannels does not match e2e');
			t.end();
		}
	}, (err) => {
		t.fail('Failed to send queryChannels due to error: ' + err.stack ? err.stack : err);
		t.end();
	}).catch((err) => {
		t.fail('Failed to queryChannels with error:' + err.stack ? err.stack : err);
		t.end();
	});
});
