/*
 *  Copyright (c) 2013-2014 The CCP project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a Beijing Speedtong Information Technology Co.,Ltd license
 *  that can be found in the LICENSE file in the root of the web site.
 *
 *   http://www.yuntongxun.com
 *
 *  An additional intellectual property rights grant can be found
 *  in the file PATENTS.  All contributing project authors may
 *  be found in the AUTHORS file in the root of the source tree.
 */
#ifndef _EC_APP_CLIENT_H_
#define _EC_APP_CLIENT_H_
#include "ECStructDef.h"

#ifdef __cplusplus
extern "C" 
{
#endif
//////////////////////////////////////////////////回调函数接口///////////////////////////////////////////////////////////
	//回调设置接口，必须主调前调用
	EC_CALL_API void SetGeneralCallBackFuction(ECGeneralCallBackInterface *InitInterface);
	
	
//////////////////////////////////////////////////主调函数接口///////////////////////////////////////////////////////////
     /*! @function
     ********************************************************************************
     函数名   : SetTraceFlag
     功能     : 日志开关。包括日志打印回调和写日志文件
	  参数     : [IN]  level				  :日志级别，小于0为关闭日志，参考EClogLevel，越大越打印的日志越多越详细
				 [IN]  logFileName			  :底层日志全路径，空为不写日志
				 [IN]  type                   :日志管理模式，0 默认模式，用户自管理;  1压缩模式，sdk管理   
				 [IN]  maxSizeMB              :日志文件大小(M)  
				 [IN]  days                   :日志保留时间（天）
     返回值   : 无。
     *******************************************************************************/
	EC_CALL_API void SetTraceFlag(int level,const char *logFileName);
	EC_CALL_API void SetTraceFlagEX(int level,const char *logFileName, int type, int maxSizeMB, int days);

	/*! @function
	********************************************************************************
	函数名   : ECSDK_Initialize
	功能     : 初始化CCP SDK
	返回值   : 是否初始化成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int ECSDK_Initialize();

	/*! @function
	********************************************************************************
	函数名   : ECSDK_UnInitialize
	功能     : 客户端注销
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int ECSDK_UnInitialize();
	
	/* @function
	 ********************************************************************************
	 函数名   : SetServerEnvType
	 功能     : 设置环境地址的类型
	 参数     : [IN]  nEnvType         : 地址类型。0 生产；1 沙盒
				[IN]  sEnvFilePath	   : 环境文件路径；路径和服务地址配置文件名均为空时，内部默认当前路径和配置文件.
										 注意：末尾需要包含目录分隔符用于判断是目录还是文件，服务地址配置文件采用时要包含，否则不要包含.
				[IN]  sServerFileName  : 服务地址配置文件名，不采用传空.
				[IN]  jsonContent	   : JSON扩展，备用.

	 返回值   : 0成功，非0失败
	 *******************************************************************************/
	EC_CALL_API int SetServerEnvType(int nEnvType, const char *sEnvFilePath);
	EC_CALL_API int SetServerEnvTypeEx(int nEnvType, const char *sEnvFilePath, const char *sServerFileName, const char* jsonContent);

	/* @function
     ********************************************************************************
     函数名   : SetInternalDNS 
	 功能     : 设置内置DNS。当模式为2时，不能调用设置地址接口
	 参数     : [IN]  mode           : dns模式。
										mode=0 关闭dns；
										mode=1 dns下载配置文件模式；
										mode=2 dns查询负载均衡模式
				[IN]  dns	         : 域名,mode>0时有效。
				[IN]  port	         : 端口,mode>0时有效。
				[IN]  isBalanceHttps : https使能。
	 返回值   : 0成功，非0失败
	 *******************************************************************************/
     EC_CALL_API int SetInternalDNS(int mode, const char *dns, int port, bool isBalanceHttps);

	/* @function
     ********************************************************************************
     函数名   : SetNetworkProxy
     功能     : 设置网络代理。需要走代理时登录前设置,不支持ssl；socks5代理支持im和点对点音视频(底层将关闭媒体流内网打洞),http代理支持im
	 参数     : [IN]  proxyHost	 : 代理服务器地址，最大长度255。当设置空时，取消代理
				[IN]  proxyPort  :  代理端口
				[IN]  authType	 : 鉴权类型。 目前支持 0 不鉴权；2 用户名密码鉴权
				[IN]  userName	 : 用户名，最大长度255。authType=2时有效
				[IN]  userPass   : 用户名密码，最大长度255。authType=2时有效
				[IN]  proxyType	 : 代理类型。 目前支持 0 socks5代理；1 http代理
     返回值   : 0成功，非0失败 
     *******************************************************************************/
	EC_CALL_API int SetNetworkProxy(const char *proxyHost,int proxyPort,int authType,const char *userName,const char* userPass, int proxyType);

	/* @function
	********************************************************************************
	函数名   : CCPsetTimeOutAckResp
	功能     : 设置业务超时时间
	参数     : [IN]  ackSecond	  : 发送到达服务器响应超时时间。 单位秒（备用，目前未启用）
			   [IN]  respSecond  : 业务成功超时时间。 单位秒
	返回值   : 0成功，非0失败
	*******************************************************************************/
	EC_CALL_API int CCPsetTimeOutAckResp(int ackSecond, int respSecond);

	/* @function
	********************************************************************************
	函数名   : CCPsetTimeOutFileResp
	功能     : 设置文件发送应答超时时间, 建议使用默认值
	参数     : [IN]  respSecond  : 响应超时时间。 单位秒 -1 默认
	返回值   : 0成功，非0失败
	*******************************************************************************/
	EC_CALL_API int CCPsetTimeOutFileResp(int respSecond);

	/* @function
	********************************************************************************
	函数名   : CCPsetKeepAliveTimeout
	功能     : 保存与设置根据网络类型不同的心跳包周期
	参数     : [IN]  networktype	: 网络类型。enum {
													NETWORK_NONE,
													NETWORK_WIFI,
													NETWORK_4G,
													NETWORK_3G,
													NETWORK_GPRS,
													NETWORK_LAN,
												};
			   [IN]  timesecond	: 超时时间。 单位秒
	返回值   : 0成功，非0失败
	*******************************************************************************/
	EC_CALL_API void CCPsetKeepAliveTimeout(int networktype, int timesecond);

	/* @function
	********************************************************************************
	函数名   : CCPsetAppInfo
	功能     : 设置上层应用的一些信息(初始化之后，登录之前进行调用设置)
	参数     : [IN]  app_info	: 上层应用信息(JSON字符串，可扩展) 例：{"appversion":"应用层版本号"}
	返回值   : 0成功，非0失败
	*******************************************************************************/
	EC_CALL_API int CCPsetAppInfo(const char* app_info);

	/*! @function
     ********************************************************************************
     函数名   : Login
     功能     : 登录服务器
     参数     :[IN]  loginInfo    : 登录信息
			   [IN]  mode         : 用于踢出功能 1: 用户输入登录(用于踢出别的设备) 2：自动登录(服务器处理自己是否踢出逻辑)
			   [IN]  jsonContent	  : 扩展JSON字符串内容(以后扩展字段均使用此字符串传递，不需要传空)
						{
							"clientIp": "" //string 客户端ip
							"comId":0 //传入业务返回的企业ID号
							"isGuid":0 //采用GUID作为设备唯一码 0 否 1 是.
						}
     返回值   : 0成功，非0失败 
	 回调函数 ： void (*onConnectState)(const ECConnectState state )
     *******************************************************************************/
	EC_CALL_API int Login(const ECLoginInfo *loginInfo);
	EC_CALL_API int LoginEx(const ECLoginInfo *loginInfo, int mode);
	EC_CALL_API int LoginEx2(const ECLoginInfo *loginInfo, int mode, const char *jsonContent);

	/*! @function
     ********************************************************************************
     函数名   : Logout
     功能     : 登出服务器
	 参数     : [IN] 无
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onLogOut)(int reason);//登出回调
     *******************************************************************************/
    EC_CALL_API int Logout();

	/*! @function
     ********************************************************************************
     函数名   : SetPersonInfo
     功能     : 设置个人资料信息
     参数     : [OUT] matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  pInfo		  : 用户信息
     返回值   : 0成功，非0失败 
	 回调函数 ：void (*onSetPersonInfo)
     *******************************************************************************/
    EC_CALL_API int SetPersonInfo(unsigned int *matchKey, ECPersonInfo* pInfo);

	/*! @function
     ********************************************************************************
     函数名   : GetPersonInfo
     功能     : 获取个人资料信息
     参数     : [OUT] matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  username : 用户账号
     返回值   : 0成功，非0失败 
	 回调函数 ：void (*onGetPersonInfo)
     *******************************************************************************/
    EC_CALL_API int GetPersonInfo(unsigned int *matchKey, const char* username);

	 /*! @function
     ********************************************************************************
     函数名   : GetUserState
     功能     : 获取个人状态
     参数     : [OUT] matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  members     : 多人用户账号。
				[IN]  membercount : 账号个数。
     返回值   : 0成功，非0失败
     回调函数 ：void (*onGetUserState)
     *******************************************************************************/
     EC_CALL_API int GetUserState(unsigned int *matchKey, const char** members, int membercount);

	 /*! @function
	 ********************************************************************************
	 函数名   : SetOnlineSubState
	 功能     : 设置个人状态
	 参数     : [IN]  tcpMsgIdOut : 回传流水号
				[IN]  substate    : 状态子类型，用户根据自己的需求定义所需的类型
	 返回值   : 0成功，非0失败
	 回调函数 ：void (*onSetOnlineSubState)
	 *******************************************************************************/
	 EC_CALL_API int SetOnlineSubState(unsigned int* matchKey, int substate);

	 /*! @function
     ********************************************************************************
     函数名   : publishPresence
     功能     : 发布状态
     参数     : [IN] matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN] type     : 类型 1：在线 2：离线
				[IN] subtype  : 在线子类型 1:  请勿打扰  2：离开 3：忙碌 4：隐身
				[IN] userdata : 私有数据。保留字段，暂时不用
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onPublishPresence)
     *******************************************************************************/
     EC_CALL_API int PublishPresence(unsigned int* matchKey, int type, int subtype, const char* userdata);

    /*! @function
     ********************************************************************************
     函数名   : PublishPresence_RX 容信使用
     功能     : 发布状态
     参数     : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
                [IN]  type        : 类型 1：在线 2：离线
                [IN]  subtype     : 在线子类型 1:  请勿打扰  2：离开 3：忙碌 4：隐身
                [IN]  userdata    : 私有数据
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onPublishPresence_RX)(unsigned int matchKey, int reason);//登出回调
     *******************************************************************************/
	 EC_CALL_API int PublishPresence_RX(unsigned int* matchKey, int type, int subtype, const char* userdata);

	 /* @function
     ********************************************************************************
     函数名   : queryErrorDescribe
     功能     : 查询错误码描述
	 参数     : [out]  errCodeDescribeOut: 回传错误码描述
				[IN]  errCodeIn          : 错误码
     返回值   : 0成功，非0失败 
     *******************************************************************************/
	 EC_CALL_API int QueryErrorDescribe(const char** errCodeDescribeOut,int errCodeIn);

	  /*! @function
     ********************************************************************************
     函数名   : GetOnlineMultiDevice
     功能     : 获取在线的其他设备
     参数     : [IN]  matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
     返回值   : 0成功，非0失败
     回调函数 ：void (*onGetOnlineMultiDevice)
     *******************************************************************************/
     EC_CALL_API int GetOnlineMultiDevice(unsigned int* matchKey);

	 /*! @function
     ********************************************************************************
     函数名   : getSerialNumber
     功能     : 生成流水号。供其他库用，生成以本sdk为基准的matchKey
     返回值   : 流水号
     *******************************************************************************/
     EC_CALL_API unsigned int GetSerialNunber();//建议废除
	 EC_CALL_API unsigned int GetSerialNumber();

	 /*! @function
     ********************************************************************************
     函数名: SendCmdToRest
     功能  : 与Rest命令交互
     参数  : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			 [IN]  cmdid : 命令枚举id。参考RestCMD.pb.h文件中枚举RestCMDEnumInner,
			 [IN]  cmdData : 命令json串。根据不同的命令枚举cmdid，发送不同的命令json串    
			 枚举及内容说明
			 cmdid=1; //开始会议服务器录制  1)meetingId:会议id； 2)member:账号； 3)type:1手机号 2VoIP账号; 4)rType:录制类型 0音频 1摄像头 2屏幕 3全部; 5)userdata;
			 cmdid=2; //停止会议服务器录制 内容同上
			 cmdid=3; //开始点对点服务器录像 {"callSid":"String 必选 callmanage服务器中通话唯一表示。例如17011015464211170001000100000d71","recordName": "String 必选 录像文件名。 例如recordname.mp4","recordPath": "String 可选 录像相对路径。 例如www/test/1226","resolution":"String 可选 录像分辨率。格式：宽 高 中间是空格， 例如：640 480","recordSource":"String 可选 录制源，0录制双方、1主叫、2被叫。默认0","mixScreen":"String 可选 是否混屏。 默认true","recordUrl":"String 可选 录制完成完整回调地址。例如 http://192.168.11.23:80/record"} 注意 文件名+目录要求唯一， 如果重复会覆盖掉
			 cmdid=4; //停止点对点服务器录像 {"callSid":"String 必选 例如17011015464211170001000100000d71"}
			 cmdid=5; //三方通话强拆 {"callSid":"String 必选 callmanage服务器中通话唯一表示。例如17011015464211170001000100000d71"}
			 cmdid=6; //通话后呼叫转接 {"callSid":"String 必选 callmanage服务器中通话唯一表示。例如17011015464211170001000100000d71","number": "String 必选 监控被叫号码。 例如13811234567","displayNum": "String 可选 显示号码，显示权由服务器控制。 例如01053283333"}
			 cmdid=7; //三方监控 {"callSid":"String 必选 callmanage服务器中通话唯一表示。例如17011015464211170001000100000d71","number": "String 必选 监控被叫号码。 例如13811234567","displayNum": "String 可选 显示号码，显示权由服务器控制。 例如01053283333"}
			 [IN]  userData :自定义参数,暂时不用
     返回值   : 0成功，非0失败
	 回调函数 ：onSendCmdToRest
     *******************************************************************************/
     EC_CALL_API int SendCmdToRest(unsigned int* matchKey, int cmdId, const char* cmdData, const char* userData);
	 
	 /*! @function
     ********************************************************************************
     函数名: SetServerAddress
     功能  : 设置服务器地址(多备用地址可以依次设置)
	 参数  : [IN]  connector_addr	: 连接服务地址
			 [IN]  connector_port	: 连接服务端口
			 [IN]  filehttp_addr	: 文件服务地址
			 [IN]  filehttp_port	: 文件服务端口
			 [IN]  lvs_addr			: lvs服务地址
			 [IN]  lvs_port			: lvs服务端口
			 [IN]  jsonContent		: json扩展参数，备用

     返回值   : 0成功，非0失败
     *******************************************************************************/
	 EC_CALL_API int SetServerAddress(const char *connector_addr, int connector_port, const char *filehttp_addr, int filehttp_port);
	 EC_CALL_API int SetServerAddressEx(const char *connector_addr, int connector_port, const char *filehttp_addr, int filehttp_port, const char *lvs_addr, int lvs_port, const char *jsonContent);

	 /* @function 
	 ************************************************************************
	 函数名 : SetHttpsPort
	 功能 : 设置用于判断https类型的端口
	 参数 : [IN] FilServerPort: 上传https端口。底层默认28090
			[IN] LvsPort: 下载https端口。底层默认28888
			[IN] ConnectorPort: 前置服务器TLS端口。底层默认28085
	 返回值 : 0成功，非0失败 
	 ***********************************************************************/
	 EC_CALL_API int SetHttpsPort(int FilServerPort,int LvsPort,int ConnectorPort);

	 /* @function
	 ************************************************************************
	 函数名 : EnableSecureTansport
	 功能   : 设置sdk是否走加密通道。一旦开启，就会走加密通道逻辑，因此必须保证服务器已支持加密。
	 参数   : [IN] bFileServerHttps : 文件服务器开关。底层默认关闭
			  [IN] bLvsServerHttps : 下载服务器开关。底层默认关闭
			  [IN] bConnectorServerTLS: 前置服务器TLS开关。底层默认关闭
	 返回值 : 0成功，非0失败 
	 ***********************************************************************/
	 EC_CALL_API int EnableSecureTansport(bool bFileServerHttps,bool bLvsServerHttps,bool bConnectorServerTLS);

	 /*! @function
	 ********************************************************************************
	 函数名   : SetMcmOsUintAccount
	 功能     : 设置统一服务器号，配合长城物业
	 参数     : [IN]  OsUintAccount     : 统一服务号
	 返回值   : 0成功； 非0失败
	 *******************************************************************************/
	 EC_CALL_API int SetMcmOsUintAccount(const char* OsUintAccount);

	 /*! @function
	 ********************************************************************************
	 函数名   : SetMuteNotification
	 功能     : 设置个人免打扰功能
	 参数     : [IN] matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN] user : 账号
				[IN] isMute : 是否静音, YES:静音，免打扰
	 返回值   : 0成功； 非0失败
	 回调函数 ：void (*onSetMuteNotification)
	 *******************************************************************************/
	 EC_CALL_API int SetMuteNotification(unsigned int* matchKey, const char* user, bool isMute);

	 /*! @function
	 ********************************************************************************
	 函数名   : RestCommonFunction
	 功能     : Rest通用函数。
	 参数     : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  method      : 方法，默认3。#define  HTTP_METHOD_GET      0
												 #define  HTTP_METHOD_PUT      1
												 #define  HTTP_METHOD_DELETE   2
												 #define  HTTP_METHOD_POST     3
				[IN]  bHttps      : 是否ssl加密，默认加密。
				[IN]  ip          : rest服务器地址
				[IN]  port		  : rest服务器端口。
				[IN]  id          : 标识。一般是应用id
				[IN]  token       : 令牌。一般是应用token
				[IN]  url         : 统一资源定位符。例如：创建直播聊天室 "/2013-12-26/Application/8a48b75153eae5150154057765c92dc6/IM/createChatRoom"
				[IN]  jsonContent : json格式的内容字符串。例如：{"chatRoomName":"测试房间","creator":"123456789abcd","declared":"Hello", "ext":"hi","pushUrl":"http//:url","pullUrl":"http//:url"}
				[OUT] callback   : 回调指针
	 返回值   : 成功 0 ，非0失败
	 回调函数 ：void (*onRestCommonFunction_CCP);
	 *******************************************************************************/
	 EC_CALL_API int RestCommonFunction(unsigned int* matchKey, int method, bool bHttps, const char* ip, int port, const char* id, const char* token, const char* url, const char* jsonContent, onRestCommonFunction callback);
   
#ifdef __cplusplus
}
#endif

#endif 
