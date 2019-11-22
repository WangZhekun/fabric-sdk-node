
The Hyperledger Fabric SDK for Node.js provides a powerful API to interact with a Hyperledger Fabric blockchain. The SDK is designed to be used in the Node.js JavaScript runtime.

### Overview 概述
Hyperledger Fabric is the operating system of an enterprise-strength permissioned blockchain network. For a high-level overview of the fabric, visit [http://hyperledger-fabric.readthedocs.io/en/latest/](http://hyperledger-fabric.readthedocs.io/en/latest/).

[Hyperledger Fabric](http://hyperledger-fabric.readthedocs.io/en/latest/)是企业级许可制区块链网络的操作系统。

Applications can be developed to interact with the blockchain network on behalf of the users. APIs are available to:
* create [channels](http://hyperledger-fabric.readthedocs.io/en/latest/fabric_model.html#privacy-through-channels)
* ask [peer nodes](http://hyperledger-fabric.readthedocs.io/en/latest/arch-deep-dive.html#peer) to join the channel
* install [chaincodes](http://hyperledger-fabric.readthedocs.io/en/latest/fabric_model.html#chaincode) in peers
* instantiate chaincodes in a channel
* invoke transactions by calling the chaincode
* query the [ledger](http://hyperledger-fabric.readthedocs.io/en/latest/fabric_model.html#ledger-features) for transactions or blocks

可以开发以用户的身份同区块链网络交互的应用。API的功能：
* 创建channel
* 访问peer节点，加入channel
* 在peer节点安装chaincode
* 在指定channel中创建chaincode实例
* 调用chaincode，执行交易
* 查询账本（ledger）中的区块或交易

### How Different Components of the Fabric Work Together Fabric的不同模块是如何协作的
The [Transaction Flow](http://hyperledger-fabric.readthedocs.io/en/latest/txflow.html) document provides an excellent description of the application/SDK, peers, and orderers working together to process transactions and producing blocks.

[交易流程（Transactino Flow）](http://hyperledger-fabric.readthedocs.io/en/latest/txflow.html)描述了应用（或SDK）、peer节点、orderer节点一起完成交易流程和产生区块的过程。

Security on the Fabric is enforced with digital signatures. All requests made to the fabric must be signed by users with appropriate enrollment certificates. For a user's enrollment certificate to be considered valid on the Fabric, it must be signed by a trusted Certificate Authority (CA). Fabric supports any standard CAs. In addition, Fabric provides a CA server. See this [overview](http://hyperledger-fabric-ca.readthedocs.io/en/latest/users-guide.html#overview).

通过数字证书实现了Fabric的安全机制。所有发送到fabric的请求都必须用用户的注册证书签名。用户的注册证书必须通过受信任的CA（Certificate Authority）签署。Fabric支持标准的CA。Fabric也提供了[CA服务](https://hyperledger-fabric-ca.readthedocs.io/en/latest/users-guide.html#overview)。

### Features of the SDK for Node.js SDK的特性
The Hyperledger Fabric SDK for Node.js is designed in an Object-Oriented programming style. Its modular construction enables application developers to plug in alternative implementations of key functions such as crypto suites, the state persistence store, and logging utility.

SDK基于面向对象思想设计。采用模块化设计，开发人员可以按需替换功能模块，如：加密套件（crypto suites）、状态持久化（the state persistence store）和日志模块（logging utility）。

The SDK's list of features include:

SDK特性包括：
* [**fabric-network**]{@link module:fabric-network} (the recommended API for):
  * [Submitting transactions]{@link module:fabric-network.Transaction} to a smart contract.
  * [Querying]{@link module:fabric-network.Transaction#evaluate} a smart contract for the latest application state.

* [`fabric-network`](https://fabric-sdk-node.github.io/release-1.4/module-fabric-network.html)
  * [提交交易](https://fabric-sdk-node.github.io/release-1.4/module-fabric-network.Transaction.html)到智能合约
  * [查询](https://fabric-sdk-node.github.io/release-1.4/module-fabric-network.Transaction.html#evaluate)智能合约的最新状态

* **fabric-client**:
  * [create a new channel]{@link Client#createChannel}
  * [send channel information to a peer to join]{@link Channel#joinChannel}
  * [install chaincode on a peer]{@link Client#installChaincode}
  * instantiate chaincode in a channel, which involves two steps: [propose]{@link Channel#sendInstantiateProposal} and [transact]{@link Channel#sendTransaction}
  * submitting a transaction, which also involves two steps: [propose]{@link Channel#sendTransactionProposal} and [transact]{@link Channel#sendTransaction}
  * [query a chaincode for the latest application state]{@link Channel#queryByChaincode}
  * various query capabilities:
    * [channel height]{@link Channel#queryInfo}
    * [block-by-number]{@link Channel#queryBlock}, [block-by-hash]{@link Channel#queryBlockByHash}
    * [all channels that a peer is part of]{@link Client#queryChannels}
    * [all installed chaincodes in a peer]{@link Client#queryInstalledChaincodes}
    * [all instantiated chaincodes in a channel]{@link Channel#queryInstantiatedChaincodes}
    * [transaction-by-id]{@link Channel#queryTransaction}
    * [channel configuration data]{@link Channel#getChannelConfig}
  * monitoring events:
    * [connect to a peer's event stream]{@link ChannelEventHub#connect}
    * listen on [block events]{@link ChannelEventHub#registerBlockEvent}
    * listen on [transactions events]{@link ChannelEventHub#registerTxEvent} and find out if the transaction was successfully committed to the ledger or marked invalid
    * listen on [custom events]{@link ChannelEventHub#registerChaincodeEvent} produced by chaincodes
  * serializable [User]{@link User} object with signing capabilities
  * [hierarchical configuration]{@link Client.getConfigSetting} settings with multiple layers of overrides: files, environment variable, program arguments, in-memory settings
  * [logging utility]{@link Client.setLogger} with a built-in logger (winston) and can be overriden with a number of popular loggers including log4js and bunyan
  * pluggable [CryptoSuite]{@link api.CryptoSuite} interface describe the cryptographic operations required for successful interactions with the Fabric. Two implementations are provided out of box:
    * [Software-based ECDSA]{@link CryptoSuite_ECDSA_AES}
    * [PKCS#11-compliant ECDSA]{@link CryptoSuite_PKCS11}
  * pluggable [State Store]{@link api.KeyValueStore} interface for persisting state caches such as users
    * [File-based store]{@link FileKeyValueStore}
    * [CouchDB-base store]{@link CouchDBKeyValueStore} which works with both CouchDB database and IBM Cloudant
  * customizable [Crypto Key Store]{@link CryptoKeyStore} for any software-based cryptographic suite implementation
  * supports both TLS (grpcs://) or non-TLS (grpc://) connections to peers and orderers, see {@link Remote} which is the superclass for [peers]{@link Peer} and [orderers]{@link Orderer}

* `fabric-client`
  * [创建新channel](https://fabric-sdk-node.github.io/release-1.4/Client.html#createChannel)
  * [发送channel信息到peer节点，将该peer节点加入channel](https://fabric-sdk-node.github.io/release-1.4/Channel.html#joinChannel)
  * [安装chaincode到peer节点](https://fabric-sdk-node.github.io/release-1.4/Client.html#installChaincode)
  * 在channel中实例化chaincode，包含两个步骤：[提案（propose）](https://fabric-sdk-node.github.io/release-1.4/Channel.html#sendInstantiateProposal)和[交易（transact）](https://fabric-sdk-node.github.io/release-1.4/Channel.html#sendTransaction)
  * 提交一个交易，包括两个步骤：[提案（propose）](https://fabric-sdk-node.github.io/release-1.4/Channel.html#sendTransactionProposal)和[交易（transact）](https://fabric-sdk-node.github.io/release-1.4/Channel.html#sendTransaction)
  * [查询chaincode的最新状态](https://fabric-sdk-node.github.io/release-1.4/Channel.html#queryByChaincode)
  * 多种查询功能
    * [channel长度](https://fabric-sdk-node.github.io/release-1.4/Channel.html#queryInfo)
    * [通过编号查询区块](https://fabric-sdk-node.github.io/release-1.4/Channel.html#queryBlock)，[通过哈希值查询区块](https://fabric-sdk-node.github.io/release-1.4/Channel.html#queryBlockByHash)
    * [查询指定peer节点加入的所有channel](https://fabric-sdk-node.github.io/release-1.4/Client.html#queryChannels)
    * [查询指定peer节点安装的所有chaincode](https://fabric-sdk-node.github.io/release-1.4/Client.html#queryChannels)
    * [查询指定channel中实例化的所有chaincode](https://fabric-sdk-node.github.io/release-1.4/Client.html#queryChannels)
    * [通过id查询交易](https://fabric-sdk-node.github.io/release-1.4/Client.html#queryChannels)
    * [查询chennal的配置项](https://fabric-sdk-node.github.io/release-1.4/Channel.html#getChannelConfig)
  * 监听事件
    * [连接指定peer节点的事件流](https://fabric-sdk-node.github.io/release-1.4/ChannelEventHub.html#connect)
    * [监听区块事件](https://fabric-sdk-node.github.io/release-1.4/ChannelEventHub.html#registerBlockEvent)
    * [监听交易事件](https://fabric-sdk-node.github.io/release-1.4/ChannelEventHub.html#registerTxEvent)，查询交易是否被成功提交到账本或置为失效
    * 监听chaincode的[自定义事件](https://fabric-sdk-node.github.io/release-1.4/ChannelEventHub.html#registerChaincodeEvent)
  * 具有签名功能的可序列化[用户对象](https://fabric-sdk-node.github.io/release-1.4/User.html)
  * 具有多层覆盖的层次配置设置：文件、环境变量、程序参数和内存中的设置
  * 具有内置日志记录器（winston）的日志模块，可以用多种流程的日志记录器覆盖之，如：log4js和bunyan
  * 插件化的密码套件接口，实现了与Fabric交互所需的加密功能。两种开箱即用的实现：
    * [Software-based ECDSA](https://fabric-sdk-node.github.io/release-1.4/CryptoSuite_ECDSA_AES.html)
    * [PKCS#11-compliant ECDSA](https://fabric-sdk-node.github.io/release-1.4/CryptoSuite_PKCS11.html)
  * 插件化的状态持久化接口，用户持久化状态缓存，如用户数据：
    * [基于文件存储](https://fabric-sdk-node.github.io/release-1.4/FileKeyValueStore.html)
    * [基于CouchDB存储](https://fabric-sdk-node.github.io/release-1.4/CouchDBKeyValueStore.html)，可以同时使用CouchDB和IBM Cloudant
  * 可为任何基于软件的加密套件实现自定义[加密密钥存储](https://fabric-sdk-node.github.io/release-1.4/CryptoKeyStore.html)
  * 支持TLS（`grpcs://`）或非TLS（`grpc://`）协议同peer节点和orderer节点连接，更多见[`Remote`类](https://fabric-sdk-node.github.io/release-1.4/Remote.html)（[`Peer`类](https://fabric-sdk-node.github.io/release-1.4/Peer.html)和[`Orderer`类](https://fabric-sdk-node.github.io/release-1.4/Orderer.html)的父类）

* **fabric-ca-client**:
  * [register]{@link FabricCAServices#register} a new user
  * [enroll]{@link FabricCAServices#enroll} a user to obtain the enrollment certificate signed by the Fabric CA
  * [revoke]{@link FabricCAServices#revoke} an existing user by enrollment ID or revoke a specific certificate
  * [customizable persistence store]{@link FabricCAServices}

* `fabric-ca-client`
  * [注册](https://fabric-sdk-node.github.io/release-1.4/FabricCAServices.html#register)新用户
  * [登记](https://fabric-sdk-node.github.io/release-1.4/FabricCAServices.html#enroll)用户，给用户办法经过Fabric CA签名的证书
  * 通过注册ID[注销](https://fabric-sdk-node.github.io/release-1.4/FabricCAServices.html#revoke)用户，或注销指定证书
  * [自定义持久化存储](https://fabric-sdk-node.github.io/release-1.4/FabricCAServices.html)

### API Reference API参考
The SDK is made up of 4 top-level modules that can be accessed through the navigation menu **Modules**:
* [**fabric-network**]{@link module:fabric-network}: Provides high level APIs for client applications to submit transactions and evaluate queries for a smart contract (chaincode).
* **api**: Pluggable APIs for application developers to supply alternative implementations of key interfaces used by the SDK. For each interface there are built-in default implementations.
* **fabric-client**: Provides APIs to interact with the core components of a Hypreledger Fabric-based blockchain network, namely the peers, orderers and event streams.
* **fabric-ca-client**: Provides APIs to interact with the optional component, fabric-ca, that contains services for membership management.
<a rel="license" href="http://creativecommons.org/licenses/by/4.0/"><img alt="Creative Commons License" style="border-width:0" src="https://i.creativecommons.org/l/by/4.0/88x31.png" /></a><br />This work is licensed under a <a rel="license" href="http://creativecommons.org/licenses/by/4.0/">Creative Commons Attribution 4.0 International License</a>.

通过`Modules`菜单的导航，可以访问SDK的4个顶级模块：
* [`fabric-network`](https://fabric-sdk-node.github.io/release-1.4/module-fabric-network.html)：为客户端应用程序提供高级API，用来提交交易和评估智能合约（chaincode）查询
* `api`：提供插件式API，供开发人员替换SDK使用的关键接口的实现。每一个接口都有内置的默认实现。
* `fabric-client`：提供用Fabric基础区块链网络（即，peer节点、orderer节点和事件流）的交互API
* `fabric-ca-client`：提供与可选组件`fabric-ca`的交互接口，该组件包含成员管理服务
