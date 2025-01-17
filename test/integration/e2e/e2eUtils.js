/**
 * Copyright 2017 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// This is an end-to-end test that focuses on exercising all parts of the fabric APIs
// in a happy-path scenario
'use strict';
const FabricCAServices = require('../../../fabric-ca-client');
const {Utils:utils} = require('fabric-common');
const logger = utils.getLogger('E2E testing');

const path = require('path');
const fs = require('fs');
const util = require('util');

const Client = require('fabric-client');
const testUtil = require('../util.js');
const e2eUtils = require('./e2eUtils.js');

const e2e = testUtil.END2END;
const e2e_node = testUtil.NODE_END2END;
let ORGS;

let tx_id = null;
let the_user = null;

function init() {
	if (!ORGS) {
		Client.addConfigFile(path.join(__dirname, './config.json'));
		ORGS = Client.getConfigSetting('test-network');
	}
}

function installChaincode(org, chaincode_path, metadata_path, version, language, t, get_admin) {
	// Set chaincode_id based on language
	let chaincode_id;
	if (language && language === 'node') {
		chaincode_id = e2e_node.chaincodeId;
	} else {
		chaincode_id = e2e.chaincodeId;
	}

	return installChaincodeWithId(org, chaincode_id, chaincode_path, metadata_path, version, language, t, get_admin);
}

function installChaincodeWithId(org, chaincode_id, chaincode_path, metadata_path, version, language, t, get_admin) {
	init();
	Client.setConfigSetting('request-timeout', 60000);
	const channel_name = Client.getConfigSetting('E2E_CONFIGTX_CHANNEL_NAME', testUtil.END2END.channel);

	const client = new Client();
	// client.setDevMode(true);
	const channel = client.newChannel(channel_name);

	const orgName = ORGS[org].name;
	const cryptoSuite = Client.newCryptoSuite();
	cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
	client.setCryptoSuite(cryptoSuite);

	const caRootsPath = ORGS.orderer.tls_cacerts;
	const data = fs.readFileSync(path.join(__dirname, caRootsPath));
	let caroots = Buffer.from(data).toString();
	// make sure the cert is OK
	caroots = Client.normalizeX509(caroots);
	let tlsInfo = null;

	return e2eUtils.tlsEnroll(org)
		.then((enrollment) => {
			t.pass('Successfully retrieved TLS certificate');
			tlsInfo = enrollment;
			client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);

			return Client.newDefaultKeyValueStore({path: testUtil.storePathForOrg(orgName)});
		}).then((store) => {
			client.setStateStore(store);

			// get the peer org's admin required to send install chaincode requests
			return testUtil.getSubmitter(client, t, get_admin /* get peer org admin */, org);
		}).then((admin) => {
			t.pass('Successfully enrolled user \'admin\' (e2eUtil 1)');
			the_user = admin;

			channel.addOrderer(
				client.newOrderer(
					ORGS.orderer.url,
					{
						'pem': caroots,
						'ssl-target-name-override': ORGS.orderer['server-hostname']
					}
				)
			);

			const targets = [];
			for (const key in ORGS[org]) {
				if (ORGS[org].hasOwnProperty(key)) {
					if (key.indexOf('peer') === 0) {
						const newData = fs.readFileSync(path.join(__dirname, ORGS[org][key].tls_cacerts));
						const peer = client.newPeer(
							ORGS[org][key].requests,
							{
								pem: Buffer.from(newData).toString(),
								'ssl-target-name-override': ORGS[org][key]['server-hostname']
							}
						);

						targets.push(peer);    // a peer can be the target this way
						channel.addPeer(peer); // or a peer can be the target this way
						// you do not have to do both, just one, when there are
						// 'targets' in the request, those will be used and not
						// the peers added to the channel
					}
				}
			}

			// send proposal to endorser
			const request = {
				targets: targets,
				chaincodePath: chaincode_path,
				metadataPath: metadata_path,
				chaincodeId: chaincode_id,
				chaincodeType: language,
				chaincodeVersion: version
			};

			return client.installChaincode(request);
		},
		(err) => {
			t.fail('Failed to enroll user \'admin\'. ' + err);
			throw new Error('Failed to enroll user \'admin\'. ' + err);
		}).then((results) => {
			const proposalResponses = results[0];

			let all_good = true;
			const errors = [];
			for (const i in proposalResponses) {
				let one_good = false;
				if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
					one_good = true;
					logger.info('install proposal was good');
				} else {
					logger.error('install proposal was bad');
					errors.push(proposalResponses[i]);
				}
				all_good = all_good & one_good;
			}
			if (all_good) {
				t.pass(util.format('Successfully sent install Proposal and received ProposalResponse: Status - %s', proposalResponses[0].response.status));
			} else {
				throw new Error(util.format('Failed to send install Proposal or receive valid response: %s', errors));
			}
		},
		(err) => {
			t.fail('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
			throw new Error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
		});
}

module.exports.installChaincode = installChaincode;
module.exports.installChaincodeWithId = installChaincodeWithId;

function instantiateChaincode(userOrg, chaincode_path, version, language, upgrade, badTransient, t) {
	// Set chaincode_id based on language
	let chaincode_id;
	if (language && language === 'node') {
		chaincode_id = e2e_node.chaincodeId;
	} else {
		chaincode_id = e2e.chaincodeId;
	}

	return instantiateChaincodeWithId(userOrg, chaincode_id, chaincode_path, version, language, upgrade, badTransient, t);
}
module.exports.instantiateChaincode = instantiateChaincode;

function instantiateChaincodeWithId(userOrg, chaincode_id, chaincode_path, version, language, upgrade, badTransient, t, channel_name) {
	init();

	if (!channel_name) {
		channel_name = Client.getConfigSetting('E2E_CONFIGTX_CHANNEL_NAME', testUtil.END2END.channel);
	}

	const targets = [];
	const txEventHubs = [];

	let type = 'instantiate';
	if (upgrade) {
		type = 'upgrade';
	}

	const client = new Client();
	const channel = client.newChannel(channel_name);

	const orgName = ORGS[userOrg].name;
	const cryptoSuite = Client.newCryptoSuite();
	cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
	client.setCryptoSuite(cryptoSuite);

	const caRootsPath = ORGS.orderer.tls_cacerts;
	const data = fs.readFileSync(path.join(__dirname, caRootsPath));
	const caroots = Buffer.from(data).toString();

	const badTransientMap = {'test1': Buffer.from('transientValue')}; // have a different key than what the chaincode example_cc1.go expects in Init()
	const transientMap = {'test': Buffer.from('transientValue')};
	let tlsInfo = null;
	let request = null;

	return e2eUtils.tlsEnroll(userOrg)
		.then((enrollment) => {
			t.pass('Successfully retrieved TLS certificate');
			tlsInfo = enrollment;
			client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);

			return Client.newDefaultKeyValueStore({path: testUtil.storePathForOrg(orgName)});
		}).then((store) => {

			client.setStateStore(store);
			return testUtil.getSubmitter(client, t, true /* use peer org admin*/, userOrg);

		}).then((admin) => {

			t.pass('Successfully enrolled user \'admin\' (e2eUtil 2)');
			the_user = admin;

			channel.addOrderer(
				client.newOrderer(
					ORGS.orderer.url,
					{
						'pem': caroots,
						'ssl-target-name-override': ORGS.orderer['server-hostname']
					}
				)
			);

			for (const org in ORGS) {
				if (ORGS[org].hasOwnProperty('peer1')) {
					const key = 'peer1';
					const newData = fs.readFileSync(path.join(__dirname, ORGS[org][key].tls_cacerts));
					logger.debug(' create new peer %s', ORGS[org][key].requests);
					const peer = client.newPeer(
						ORGS[org][key].requests,
						{
							pem: Buffer.from(newData).toString(),
							'ssl-target-name-override': ORGS[org][key]['server-hostname']
						}
					);

					targets.push(peer);
					channel.addPeer(peer);

					const eh = channel.newChannelEventHub(peer);
					txEventHubs.push(eh);
				}
			}

			// read the config block from the peer for the channel
			// and initialize the verify MSPs based on the participating
			// organizations
			return channel.initialize();
		}, (err) => {

			t.fail('Failed to enroll user \'admin\'. ' + err);
			throw new Error('Failed to enroll user \'admin\'. ' + err);

		}).then(() => {
			t.pass('Successfully initialized Channel');
			logger.debug(' orglist:: ', channel.getOrganizations());
			// the v1 chaincode has Init() method that expects a transient map
			if (upgrade && badTransient) {
			// first test that a bad transient map would get the chaincode to return an error
				request = buildChaincodeProposal(client, the_user, chaincode_id, chaincode_path, version, language, upgrade, badTransientMap);
				tx_id = request.txId;

				logger.debug(util.format(
					'Upgrading chaincode "%s" at path "%s" to version "%s" by passing args "%s" to method "%s" in transaction "%s"',
					request.chaincodeId,
					request.chaincodePath,
					request.chaincodeVersion,
					request.args,
					request.fcn,
					request.txId.getTransactionID()
				));

				// this is the longest response delay in the test, sometimes
				// x86 CI times out. set the per-request timeout to a super-long value
				return channel.sendUpgradeProposal(request, 10 * 60 * 1000)
					.then((results) => {
						const proposalResponses = results[0];

						if (version === 'v1') {
							// expecting both peers to return an Error due to the bad transient map
							let success = false;
							if (proposalResponses && proposalResponses.length > 0) {
								proposalResponses.forEach((response) => {
									if (response && response instanceof Error &&
                    response.message.includes('Did not find expected key "test" in the transient map of the proposal')) {
										success = true;
									} else {
										success = false;
									}
								});
							}

							if (success) {
								// successfully tested the negative conditions caused by
								// the bad transient map, now send the good transient map
								request = buildChaincodeProposal(client, the_user, chaincode_id, chaincode_path,
									version, language, upgrade, transientMap);
								tx_id = request.txId;

								return channel.sendUpgradeProposal(request, 10 * 60 * 1000);
							} else {
								throw new Error('Failed to test for bad transient map. The chaincode should have rejected the upgrade proposal.');
							}
						} else if (version === 'v3') {
							return Promise.resolve(results);
						}
					});
			} else {
				const request2 = buildChaincodeProposal(client, the_user, chaincode_id, chaincode_path, version, language, upgrade, transientMap);
				tx_id = request2.txId;

				// this is the longest response delay in the test, sometimes
				// x86 CI times out. set the per-request timeout to a super-long value
				if (upgrade) {
					return channel.sendUpgradeProposal(request2, 10 * 60 * 1000);
				} else {
					return channel.sendInstantiateProposal(request2, 10 * 60 * 1000);
				}
			}

		}, (err) => {

			t.fail(util.format('Failed to initialize the channel. %s', err.stack ? err.stack : err));
			throw new Error('Failed to initialize the channel');

		}).then((results) => {

			const proposalResponses = results[0];

			const proposal = results[1];
			let all_good = true;
			for (const response of proposalResponses) {
				if (response instanceof Error) {
					t.comment('Proposal failed to ' + chaincode_id + ' :: ' + response.toString());
					all_good = false;
				} else if (response.response && response.response.status === 200) {
					logger.info(type + ' proposal was good');
				} else {
					logger.error(type + ' proposal was bad for unknown reason');
					all_good = false;
				}
			}
			if (all_good) {
				t.pass('Successfully sent Proposal and received ProposalResponse');
				logger.debug(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
				request = {
					proposalResponses: proposalResponses,
					proposal: proposal
				};
			} else {
				logger.debug(JSON.stringify(proposalResponses));
				throw new Error('All proposals were not good');
			}

			const deployId = tx_id.getTransactionID();
			const eventPromises = [];
			eventPromises.push(channel.sendTransaction(request));

			txEventHubs.forEach((eh) => {
				const txPromise = new Promise((resolve, reject) => {
					const handle = setTimeout(() => {
						t.fail('Timeout - Failed to receive the event for instantiate:  waiting on ' + eh.getPeerAddr());
						eh.disconnect();
						reject('TIMEOUT waiting on ' + eh.getPeerAddr());
					}, 120000);

					eh.registerTxEvent(deployId.toString(), (tx, code) => {
						t.pass('The chaincode ' + type + ' transaction has been committed on peer ' + eh.getPeerAddr());
						clearTimeout(handle);
						if (code !== 'VALID') {
							t.fail('The chaincode ' + type + ' transaction was invalid, code = ' + code);
							reject();
						} else {
							t.pass('The chaincode ' + type + ' transaction was valid.');
							resolve();
						}
					}, (err) => {
						t.fail('There was a problem with the instantiate event ' + err);
						clearTimeout(handle);
						reject();
					}, {
						disconnect: true
					});
					eh.connect();
				});
				logger.debug('register eventhub %s with tx=%s', eh.getPeerAddr(), deployId);
				eventPromises.push(txPromise);
			});

			return Promise.all(eventPromises);
		}).then((results) => {
			if (results && !(results[0] instanceof Error) && results[0].status === 'SUCCESS') {
				t.pass('Successfully sent ' + type + 'transaction to the orderer.');
				return true;
			} else {
				t.fail('Failed to order the ' + type + 'transaction. Error code: ' + results[0].status);
				Promise.reject(new Error('Failed to order the ' + type + 'transaction. Error code: ' + results[0].status));
			}
		}).catch((err) => {
			t.fail('Failed to instantiate ' + type + ' due to error: ' + err.stack ? err.stack : err);
		});
}
module.exports.instantiateChaincodeWithId = instantiateChaincodeWithId;

function buildChaincodeProposal(client, theuser, chaincode_id, chaincode_path, version, type, upgrade, transientMap) {
	tx_id = client.newTransactionID();

	// send proposal to endorser
	const request = {
		chaincodePath: chaincode_path,
		chaincodeId: chaincode_id,
		chaincodeVersion: version,
		fcn: 'init',
		args: ['a', '100', 'b', '200'],
		txId: tx_id,
		chaincodeType: type,
		// use this to demonstrate the following policy:
		// 'if signed by org1 admin, then that's the only signature required,
		// but if that signature is missing, then the policy can also be fulfilled
		// when members (non-admin) from both orgs signed'
		'endorsement-policy': {
			identities: [
				{role: {name: 'member', mspId: ORGS.org1.mspid}},
				{role: {name: 'member', mspId: ORGS.org2.mspid}},
				{role: {name: 'admin', mspId: ORGS.org1.mspid}}
			],
			policy: {
				'1-of': [
					{'signed-by': 2},
					{'2-of': [{'signed-by': 0}, {'signed-by': 1}]}
				]
			}
		},
		'collections-config': testUtil.COLLECTIONS_CONFIG_PATH
	};

	if (version === 'v3') {
		request.args = ['b', '1000'];
	}

	if (upgrade) {
		// use this call to test the transient map support during chaincode instantiation
		request.transientMap = transientMap;
	}

	return request;
}
module.exports.buildChaincodeProposal = buildChaincodeProposal;

function invokeChaincode(userOrg, version, chaincodeId, t, useStore, fcn, args, expectedResult, expectedPrivateDataMap) {
	init();

	logger.debug('invokeChaincode begin');
	Client.setConfigSetting('request-timeout', 60000);
	const channel_name = Client.getConfigSetting('E2E_CONFIGTX_CHANNEL_NAME', testUtil.END2END.channel);

	const txEventHubs = [];
	const blockEventHubs = [];
	let pass_results = null;

	// this is a transaction, will just use org's identity to
	// submit the request. intentionally we are using a different org
	// than the one that instantiated the chaincode, although either org
	// should work properly
	const client = new Client();
	const channel = client.newChannel(channel_name);

	let orgName = ORGS[userOrg].name;
	const cryptoSuite = Client.newCryptoSuite();
	if (useStore) {
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
		client.setCryptoSuite(cryptoSuite);
	}

	const caRootsPath = ORGS.orderer.tls_cacerts;
	const data = fs.readFileSync(path.join(__dirname, caRootsPath));
	const caroots = Buffer.from(data).toString();
	let tlsInfo = null;

	orgName = ORGS[userOrg].name;

	let promise;
	if (useStore) {
		promise = Client.newDefaultKeyValueStore({
			path: testUtil.storePathForOrg(orgName)});
	} else {
		promise = Promise.resolve(useStore);
	}

	return e2eUtils.tlsEnroll(userOrg)
		.then((enrollment) => {
			t.pass('Successfully retrieved TLS certificate');
			tlsInfo = enrollment;
			client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);

			return promise;
		}).then((store) => {
			if (store) {
				client.setStateStore(store);
			}
			return testUtil.getSubmitter(client, t, userOrg);
		}).then((admin) => {

			t.pass('Successfully enrolled user \'admin\' (e2eUtil 3)');
			the_user = admin;

			channel.addOrderer(
				client.newOrderer(
					ORGS.orderer.url,
					{
						'pem': caroots,
						'ssl-target-name-override': ORGS.orderer['server-hostname']
					}
				)
			);

			// set up the channel to use each org's 'peer1' for
			// both requests and events
			for (const key in ORGS) {
				if (ORGS.hasOwnProperty(key) && typeof ORGS[key].peer1 !== 'undefined') {
					const newData = fs.readFileSync(path.join(__dirname, ORGS[key].peer1.tls_cacerts));
					const peer = client.newPeer(
						ORGS[key].peer1.requests,
						{
							name:ORGS[key].name,
							pem: Buffer.from(newData).toString(),
							'ssl-target-name-override': ORGS[key].peer1['server-hostname']
						}
					);
					channel.addPeer(peer);
					txEventHubs.push(channel.newChannelEventHub(peer));
					blockEventHubs.push(channel.newChannelEventHub(peer));
				}
			}

			return channel.initialize();

		}).then(() => {
			logger.debug(' orglist:: ', channel.getOrganizations());

			tx_id = client.newTransactionID();
			utils.setConfigSetting('E2E_TX_ID', tx_id.getTransactionID());
			logger.debug('setConfigSetting("E2E_TX_ID") = %s', tx_id.getTransactionID());

			// send proposal to endorser
			const request = {
				chaincodeId : chaincodeId,
				fcn: fcn,
				args: args,
				txId: tx_id,
			};
			return channel.sendTransactionProposal(request);

		}, (err) => {

			t.fail('Failed to enroll user \'admin\'. ' + err);
			throw new Error('Failed to enroll user \'admin\'. ' + err);
		}).then((results) => {
			pass_results = results;
			let sleep_time = 0;
			// can use "sleep=30000" to give some time to manually stop and start
			// the peer so the event hub will also stop and start
			if (process.argv.length > 2) {
				if (process.argv[2].indexOf('sleep=') === 0) {
					sleep_time = process.argv[2].split('=')[1];
				}
			}
			t.comment('*****************************************************************************');
			t.comment('stop and start the peer event hub ---- N  O  W ----- you have ' + sleep_time + ' millis ' + (new Date()).toString());
			t.comment('*****************************************************************************');
			return exports.sleep(sleep_time);
		}).then(async() => {

			const proposalResponses = pass_results[0];
			const proposal = pass_results[1];
			let all_good = true;
			for (const i in proposalResponses) {
				let one_good = false;
				const proposal_response = proposalResponses[i];

				if (expectedResult instanceof Error) {
					t.true((proposal_response instanceof Error), 'proposal response should be an instance of error');
					t.pass('Error message::' + proposal_response.message);
					t.true(proposal_response.message.includes(expectedResult.message), 'error should contain the correct message: ' + expectedResult.message);
				} else {
					logger.debug('invoke chaincode, proposal response: ' + util.inspect(proposal_response, {depth: null}));
					if (proposal_response.response && proposal_response.response.status === 200) {
						t.pass('transaction proposal has response status of good');
						one_good = await channel.verifyProposalResponse(proposal_response);
						if (one_good) {
							t.pass('transaction proposal signature and endorser are valid');
						}

						// check payload
						const payload = proposal_response.response.payload.toString();
						// verify payload is equal to expectedResult
						if (payload === expectedResult) {
							t.pass('transaction proposal payloads are valid');
						} else {
							one_good = false;
							t.fail('transaction proposal payloads are invalid, expect ' + expectedResult + ', but got ' + payload);
						}
					} else {
						t.fail('invokeChaincode: transaction proposal was bad');
					}
					all_good = all_good & one_good;
				}
			}
			if (expectedResult instanceof Error) {
				return;
			}

			if (all_good) {
			// check all the read/write sets to see if the same, verify that each peer
			// got the same results on the proposal
				all_good = channel.compareProposalResponseResults(proposalResponses);
				t.pass('compareProposalResponseResults exection did not throw an error');
				if (all_good) {
					t.pass(' All proposals have a matching read/writes sets');
				} else {
					t.fail(' All proposals do not have matching read/write sets');
				}
			}
			if (all_good) {
			// check to see if all the results match
				t.pass('Successfully sent Proposal and received ProposalResponse');
				logger.debug(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
				const request = {
					proposalResponses: proposalResponses,
					proposal: proposal
				};

				// set the transaction listener and set a timeout of 30sec
				// if the transaction did not get committed within the timeout period,
				// fail the test
				const deployId = tx_id.getTransactionID();

				const eventPromises = [];
				txEventHubs.forEach((eh) => {
					const txPromise = new Promise((resolve, reject) => {
						const handle = setTimeout(() => {
							t.fail('Timeout - Failed to receive the event for commit:  waiting on ' + eh.getPeerAddr());
							eh.disconnect(); // will not be using this event hub
							reject('TIMEOUT waiting on ' + eh.getPeerAddr());
						}, 30000);

						eh.registerTxEvent(deployId.toString(), (tx, code) => {
							clearTimeout(handle);
							if (code !== 'VALID') {
								t.fail('The balance transfer transaction was invalid, code = ' + code);
								reject();
							} else {
								t.pass('The balance transfer transaction has been committed on peer ' + eh.getPeerAddr());
								resolve();
							}
						}, () => {
							clearTimeout(handle);
							t.pass('Successfully received notification of the event call back being cancelled for ' + deployId);
							resolve();
						}, {
							disconnect: true // will not be using this event hub
						});
						eh.connect();
					});
					eventPromises.push(txPromise);
				});

				if (expectedPrivateDataMap) {

					if (!Object.keys(expectedPrivateDataMap).length) {
						throw new Error('the expected private data map can not be empty');
					}

					blockEventHubs.forEach((eh) => {

						const peerName = eh.getName();
						const expectedPrivateData = expectedPrivateDataMap[peerName]; // we make sure to be checking the right private data for each peer org

						const blockPromise = new Promise((resolve, reject) => {

							const handle = setTimeout(() => {
								if (Object.keys(expectedPrivateData).length) {
									t.fail('Timeout - Failed to receive the the expected private data in the block event:  waiting on ' + eh.getPeerAddr());
									eh.disconnect(); // will not be using this event hub
									reject('TIMEOUT waiting on ' + eh.getPeerAddr());
								}
							}, 30000);

							eh.registerBlockEvent((block) => {
								const privateData = block.private_data;
								if (blockHavePrivateDataHashes(block)) {
									if (checkPrivateDataContent(privateData, expectedPrivateData)) {
										t.pass('Successfully received the private data in the deliver of the block ' + block.header.number + ' at the eventhub on  ' +  eh.getPeerAddr());
									}
								}
								// if there is no more data to expect, is because it found everything that expected
								// that means the calling was succesfull
								if (!Object.keys(expectedPrivateData).length) {
									t.pass('Successfully checked the presence of the expected private data in the blocks delivered by eventhub  ' +  eh.getPeerAddr());
									delete expectedPrivateDataMap[peerName]; // as we found the expected private data element, then we delete it because we dont expect it anymore
									if (!Object.keys(expectedPrivateDataMap).length) { // expecting no more data, then it was all found
										t.pass('Successfully checked the presence of all the expectedPrivateData in the blocks delivered');
									}
									clearTimeout(handle);
									eh.disconnect();
									resolve();
								}
							}, (error) => {
								if (Object.keys(expectedPrivateData).length) {
									t.fail('There was a problem with the fetching of the block: ' + error + ' and there is still expecting results to be checked');
									clearTimeout(handle);
									reject(error);
								}
							});
							eh.connect({full_block:true, private_data:true});

						});
						eventPromises.push(blockPromise);
					});
				}

				const sendPromise = channel.sendTransaction(request);
				return Promise.all([sendPromise].concat(eventPromises))
					.then((results) => {

						logger.debug(' event promise all complete and testing complete');
						return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call

					}).catch((err) => {

						t.fail('Failed transaction ::' + err);
						throw new Error('Failed transaction ::' + err);

					});

			} else {
				t.fail('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
				throw new Error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
			}
		}, (err) => {

			t.fail('Failed to send proposal due to error: ' + err.stack ? err.stack : err);
			throw new Error('Failed to send proposal due to error: ' + err.stack ? err.stack : err);

		}).then((response) => {
			if (expectedResult instanceof Error) {
				channel.close();
				t.pass('Successfully closed all connections');
				return true;
			}

			if (response.status === 'SUCCESS') {
				t.pass('Successfully sent transaction to the orderer.');
				t.comment('******************************************************************');
				t.comment('To manually run /test/integration/query.js, set the following environment variables:');
				t.comment('export E2E_TX_ID=' + '\'' + tx_id.getTransactionID() + '\'');
				t.comment('******************************************************************');
				logger.debug('invokeChaincode end');

				// close the connections
				channel.close();
				t.pass('Successfully closed all connections');
				return true;
			} else {
				t.fail('Failed to order the transaction. Error code: ' + response.status);
				throw new Error('Failed to order the transaction. Error code: ' + response.status);
			}
		}, (err) => {

			t.fail('Failed to send transaction due to error: ' + err.stack ? err.stack : err);
			throw new Error('Failed to send transaction due to error: ' + err.stack ? err.stack : err);

		});
}

module.exports.invokeChaincode = invokeChaincode;

// Targets parameter is needed to query private data that are only available on a subset of peers based on collection policy.
// pass [] to targets when you don't want to query a specific peer
function queryChaincode(org, version, targets, fcn, args, value, chaincodeId, t, transientMap, usestore = true) {
	init();

	Client.setConfigSetting('request-timeout', 60000);
	const channel_name = Client.getConfigSetting('E2E_CONFIGTX_CHANNEL_NAME', testUtil.END2END.channel);

	// this is a transaction, will just use org's identity to
	// submit the request. intentionally we are using a different org
	// than the one that submitted the "move" transaction, although either org
	// should work properly
	const client = new Client();
	const channel = client.newChannel(channel_name);

	const orgName = ORGS[org].name;
	const cryptoSuite = Client.newCryptoSuite();
	if (usestore) {
		cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
		client.setCryptoSuite(cryptoSuite);
	}

	let tlsInfo = null;

	return e2eUtils.tlsEnroll(org)
		.then((enrollment) => {
			t.pass('Successfully retrieved TLS certificate');
			tlsInfo = enrollment;
			client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);

			return Client.newDefaultKeyValueStore({path: testUtil.storePathForOrg(orgName)});
		}).then((store) => {
			if (usestore) {
				client.setStateStore(store);
			}
			return testUtil.getSubmitter(client, t, org);
		}).then((admin) => {
			the_user = admin;

			t.pass('Successfully enrolled user \'admin\' (e2eUtil 4)');

			// set up the channel to use each org's 'peer1' for
			// both requests and events
			for (const key in ORGS) {
				if (ORGS.hasOwnProperty(key) && typeof ORGS[key].peer1 !== 'undefined') {
					const data = fs.readFileSync(path.join(__dirname, ORGS[key].peer1.tls_cacerts));
					const peer = client.newPeer(
						ORGS[key].peer1.requests,
						{
							pem: Buffer.from(data).toString(),
							'ssl-target-name-override': ORGS[key].peer1['server-hostname']
						});
					channel.addPeer(peer);
				}
			}

			// send query
			const request = {
				chaincodeId : chaincodeId,
				fcn: fcn,
				args: args,
				request_timeout: 3000
			};

			// find the peers that match the targets
			if (targets && targets.length !== 0) {
				const targetPeers = getTargetPeers(channel, targets);
				if (targetPeers.length < targets.length) {
					t.fail('Failed to get all peers for targets: ' + targets);
				} else {
					request.targets = targetPeers;
				}
			}

			if (transientMap) {
				request.transientMap = transientMap;
				request.fcn = 'testTransient';
			}

			return channel.queryByChaincode(request);
		},
		(err) => {
			t.fail('Failed to get submitter \'admin\'. Error: ' + err.stack ? err.stack : err);
			throw new Error('Failed to get submitter');
		}).then((response_payloads) => {
			if (response_payloads) {
				logger.debug('query chaincode, response_payloads: ' + util.inspect(response_payloads, {depth: null}));
				for (let i = 0; i < response_payloads.length; i++) {
					if (transientMap) {
						t.equal(
							response_payloads[i].toString(),
							transientMap[Object.keys(transientMap)[0]].toString(),
							'Checking the result has the transientMap value returned by the chaincode');
					} else {
						if (value instanceof Error) {
							t.true((response_payloads[i] instanceof Error), 'query result should be an instance of error');
							t.pass('Error message::' + response_payloads[i].message);
							t.true(response_payloads[i].message.includes(value.message), 'error should contain the correct message: ' + value.message);
						} else {
							t.equal(
								response_payloads[i].toString('utf8'),
								value,
								'checking query results are correct that value is ' + value);
						}
					}
				}
				return true;
			} else {
				t.fail('response_payloads is null');
				throw new Error('Failed to get response on query');
			}
		},
		(err) => {
			t.fail('Failed to send query due to error: ' + err.stack ? err.stack : err);
			throw new Error('Failed, got error on query');
		});
}

module.exports.queryChaincode = queryChaincode;

module.exports.sleep = testUtil.sleep;

function loadMSPConfig(name, mspdir) {
	const msp = {};
	msp.id = name;
	msp.rootCerts = readAllFiles(path.join(__dirname, mspdir, 'cacerts'));
	msp.admins = readAllFiles(path.join(__dirname, mspdir, 'admincerts'));
	return msp;
}
module.exports.loadMSPConfig = loadMSPConfig;

function readAllFiles(dir) {
	const files = fs.readdirSync(dir);
	const certs = [];
	files.forEach((file_name) => {
		const file_path = path.join(dir, file_name);
		const data = fs.readFileSync(file_path);
		certs.push(data);
	});
	return certs;
}
module.exports.readAllFiles = readAllFiles;

function tlsEnroll(orgName) {
	return new Promise(((resolve, reject) => {
		FabricCAServices.addConfigFile(path.join(__dirname, 'config.json'));
		const orgs = FabricCAServices.getConfigSetting('test-network');
		if (!orgs[orgName]) {
			throw new Error('Invalid org name: ' + orgName);
		}
		const fabricCAEndpoint = orgs[orgName].ca.url;
		const tlsOptions = {
			trustedRoots: [],
			verify: false
		};
		const caService = new FabricCAServices(fabricCAEndpoint, tlsOptions, orgs[orgName].ca.name);
		const req = {
			enrollmentID: 'admin',
			enrollmentSecret: 'adminpw',
			profile: 'tls'
		};
		caService.enroll(req).then(
			(enrollment) => {
				enrollment.key = enrollment.key.toBytes();
				return resolve(enrollment);
			},
			(err) => {
				return reject(err);
			}
		);
	}));
}
module.exports.tlsEnroll = tlsEnroll;

// return an array of peer objects for targets which are a array of peer urls in string (e.g., localhost:7051)
function getTargetPeers(channel, targets) {
	// get all the peers and then find what peer matches a target
	const targetPeers = [];
	if (targets && targets.length !== 0) {
		const peers = channel.getPeers();
		for (const i in targets) {
			let found = false;
			for (const j in peers) {
				logger.debug('channel has peer ' + peers[j].getName());
				if (targets[i] === peers[j].getName()) {
					targetPeers.push(peers[j]);
					found = true;
					break;
				}
			}
			if (!found) {
				logger.Error('Cannot find the target peer for ' + targets[i]);
			}
		}
	}
	return targetPeers;
}

// checks if a block contains transactions with private data
function blockHavePrivateDataHashes(block) {
	// iterate over the block to look if there is any trail of private data
	let hasPrivateData = false;

	const blockData = block.data.data;
	blockData.forEach((dataItem) => {
		const payloadActions = dataItem.payload.data.actions;
		payloadActions.forEach((payloadAction) => {
			const nsRWSet = payloadAction.payload.action.proposal_response_payload.extension.results.ns_rwset;
			nsRWSet.forEach((rw) => {
				const collectionHashedRWset = rw.collection_hashed_rwset;
				if (collectionHashedRWset.length) { // if collectionHashedRWset is not empty then it have private data... obviously
					hasPrivateData = true;
				}
			});
		});
	});

	return hasPrivateData;

}

// checks that the private data matches the expected result
function checkPrivateDataContent(privateData, expectedResults) {

	if (!expectedResults || Object.keys(expectedResults).length === 0) {
		throw new Error('you have to provide some expected results');
	}
	if (!privateData || Object.keys(privateData).length === 0) {
		throw new Error('you have to provide private data to check');
	}

	// we iterate over the complexity of the private data object to gouge out the value of the writes

	for (const i in privateData) {
		// here we iterate over each transaction in the block


		const privateDataTransaction = privateData[i];
		for (const j in privateDataTransaction.ns_pvt_rwset) {
			// here we iterate over each namespace read-write set

			const nsPrivateRW = privateDataTransaction.ns_pvt_rwset[j];
			for (const k in nsPrivateRW.collection_pvt_rwset) {
				// here we iterate over each collection read-write set in the given namespace

				const colPrivateRW = nsPrivateRW.collection_pvt_rwset[k];
				// we look for the expected value given the name of the collection that we have in this iteration
				const expectedValue = expectedResults[colPrivateRW.collection_name];

				if (!expectedValue) {
					// if expectedValue is undefined is because the collection name was not present in the expectedResults parameter
					continue;
				}

				for (const l in colPrivateRW.rwset.writes) {
					const realValue = colPrivateRW.rwset.writes[l];
					if (realValue.key === expectedValue.key && realValue.value === expectedValue.value) {
						// if we found in the real private data values a matching pair with the expected values
						// then we remove it from the expected results, because we are no more expecting them
						delete expectedResults[colPrivateRW.collection_name];
					}
				}
			}
		}
	}

	// if the expected results are empty is because we found all af them, and then we dont expect them anymore
	// that means that the checking was successful, otherwise not
	return (Object.keys(expectedResults).length === 0);
}

async function getCollectionsConfig(t, org, chaincodeId, channel_name) {
	init();

	// this is a transaction, will just use org's identity to
	// submit the request. intentionally we are using a different org
	// than the one that submitted the "move" transaction, although either org
	// should work properly
	const client = new Client();
	const channel = client.newChannel(channel_name);

	const orgName = ORGS[org].name;
	const cryptoSuite = Client.newCryptoSuite();
	cryptoSuite.setCryptoKeyStore(Client.newCryptoKeyStore({path: testUtil.storePathForOrg(orgName)}));
	client.setCryptoSuite(cryptoSuite);
	let tlsInfo = null;

	try {
		const enrollment = await e2eUtils.tlsEnroll(org);
		t.pass('Successfully retrieved TLS certificate');
		tlsInfo = enrollment;
		client.setTlsClientCertAndKey(tlsInfo.certificate, tlsInfo.key);
		const store = await Client.newDefaultKeyValueStore({path: testUtil.storePathForOrg(orgName)});
		client.setStateStore(store);

		const admin = await testUtil.getSubmitter(client, t, org);
		await client.setUserContext(admin);
		t.pass('Successfully enrolled user \'admin\'');

		const caRootsPath = ORGS[org].peer1.tls_cacerts;
		const data = fs.readFileSync(path.join(__dirname, '../e2e', caRootsPath));
		const caroots = Buffer.from(data).toString();

		const peer = client.newPeer(
			ORGS[org].peer1.requests,
			{
				'pem': caroots,
				'ssl-target-name-override': ORGS[org].peer1['server-hostname']
			}
		);

		const request = {
			chaincodeId: chaincodeId,
			target: peer
		};

		try {
			const resp = await channel.queryCollectionsConfig(request);
			t.pass('Successfully retrieved collections config from peer');
			return resp;
		} catch (error) {
			throw error;
		}
	} catch (error) {
		t.fail(error.message);
		throw error;
	}
}

module.exports.getCollectionsConfig = getCollectionsConfig;
