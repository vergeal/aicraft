#ifndef _EC_IM_INTERFACE_H
#define _EC_IM_INTERFACE_H

#include "ECImStructDef.h"
#ifdef __cplusplus
extern "C" 
{
#endif

//////////////////////////////////////////////////回调函数接口///////////////////////////////////////////////////////////
	//回调设置接口，必须在主调前调用
	EC_CALL_API void SetMessageCallBackFunction(ECMessageCallBackInterface *MessageInterface);

//////////////////////////////////////////////////主调函数接口///////////////////////////////////////////////////////////
	 /*! @function
     ********************************************************************************
     函数名   : SendTextMessage
     功能     : 发送消息
	 参数     : [OUT] matchKey        : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  receiver        : 接收者用户名
				[IN]  message         : 文本消息内容
				[IN]  type            : type消息类型 目前支持Msg_Type_Text:文本消息  以后会扩展类型
				[IN]  userdata        : 需要扩展的消息字段放在这里
				[OUT] msgId			  : 发送消息的ID, 需要先申请64字节长度的Buffer，接口会将ID写入到Buffer中。
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onSendTextMessage)
     *******************************************************************************/
	EC_CALL_API int SendTextMessage(unsigned int *matchKey,const char *receiver, const char *message, MsgType type, const char *userdata, char * msgId);//此接口建议废弃，使用下面的接口SendTextMessageEX

/*! @function
     ********************************************************************************
     函数名   : SendTextMessageEX
     功能     : 发送消息
	 参数     : [OUT] matchKey        : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  receiver        : 接收者用户名
				[IN]  message         : 文本消息内容
				[IN]  type            : type消息类型 目前支持Msg_Type_Text:文本消息  以后会扩展类型
				[IN]  userdata        : 需要扩展的消息字段放在这里
				[OUT] msgId			  : 发送消息的ID, 需要先申请64字节长度的Buffer，接口会将ID写入到Buffer中。
				[IN]  extOpts         : 用户传入，包括群组中被@的成员列表和被@的成员个数
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onSendTextMessage)
     *******************************************************************************/
	EC_CALL_API int SendTextMessageEX(unsigned int *matchKey,const char *receiver, const char *message, MsgType type, const char *userdata, char * msgId, const char *extOpts);

	 /*! @function
     ********************************************************************************
     函数名   : SendMediaMessage
     功能     : 上传文件
	 参数     : [OUT] matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  receiver    : 接收者
				[IN]  fileName    : 附件全路径
				[IN]  type        : type消息类型  Msg_Type_Voice：语音消息 Msg_Type_Video：视频消息  Msg_Type_Picture：图片消息 Msg_Type_File：文件 
				[IN]  userdate    : 需要扩展的消息字段放在这里
				[OUT] msgId		  : 发送消息的ID, 需要先申请64字节长度的Buffer，接口会将ID写入到Buffer中。
				[IN]  offsetJson  : 文件重传串,支持type为Msg_Type_File == type || Msg_Type_File_UnCompress，{"offset":unsigned longlong,"reSendMsgId":"msgId"},这里msgId为开启断点续传第一次上传时返回的msgId
				[IN]  extOpts     : 服务器业务扩展字段 json字符串
				[IN]  rotate      : 旋转角度
				[IN]  UUID        : 唯一标识
				[IN]  displayname : 发送者的显示名称
     返回值   : 0成功； 非0失败
	 回调函数 ：void (*onSendMediaFile)
     *******************************************************************************/
	EC_CALL_API int SendMediaMessage(unsigned int *matchKey,const char* receiver,const char* fileName, MsgType type,const char* userdata,  char * msgId);   
    EC_CALL_API int SendMediaMessageEX(unsigned int *matchKey,const char* receiver,const char* fileName, MsgType type,const char* userdata,  char * msgId,char* offsetJson, const char *extOpts, int rotate, const char* UUID, const char* displayname);
    
    /*! @function
     ********************************************************************************
     函数名   : sendMCMMessage
     功能     : 发送消息
     参数     : [IN]  tcpMsgIdOut     : 回传流水号
				[IN]  event			  : 事件类型 参考枚举 MCMEventDef
				[IN]  receiver        : 接收者用户名
				[IN]  message         : 文本消息内容
				[IN]  msgUserdata     : 用户自定义数据
				[IN]  msgJsonData     : 多渠道管理json数据
				[IN]  nickName        : 昵称
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onSendMCMMessage)(unsigned int tcpMsgIdOut, int reason)
     *******************************************************************************/
    EC_CALL_API int SendMCMMessage(unsigned int* matchKey, ECMCMEventType event, const char *receiver, const char *message, const char* msgUserdata, const char* msgJsonData, const char* parameterJsonData, const char* ccpCustomData);
    
    EC_CALL_API int SendMcmMediaMessage(unsigned int *matchKey,const char* receiver,const char* fileName, MsgType type, const char* userdata,  char * msgId, const char *jsonString, bool isUser);
    
    /*! @function
     ********************************************************************************
     函数名   : DownloadFileMessage
     功能     : 下载文件
	 参数     : [OUT] matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  sender	  : 发送者
				[IN]  recv	      : 接收者
				[IN]  url		  : 下载url
				[IN]  fileName    : 附件全路径
				[IN]  msgId       : 消息id
				[IN]  type        : type消息类型 Msg_Type_Voice：语音消息 Msg_Type_Video：视频消息  Msg_Type_Picture：图片消息  Msg_Type_File：文件 
				[IN]  offsetJson  : 文件重传串,支持type为Msg_Type_File == type || Msg_Type_File_UnCompress，{"offset":unsigned longlong}
				[IN]  UUID        : 唯一标识
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onDownloadFileComplete)
     *******************************************************************************/
	EC_CALL_API int DownloadFileMessage(unsigned int *matchKey, const char* sender,const char* recv,const char* url, const char* fileName, const char* msgId, MsgType type);
	EC_CALL_API int DownloadFileMessageEX(unsigned int *matchKey, const char* sender, const char* recv, const char* url, const char* fileName, const char* msgId, MsgType type, char* offsetJson, const char* UUID);
	
	 /*! @function
     ********************************************************************************
     函数名   : CancelUploadOrDownloadNOW
     功能     : 取消正在上传和下载的附件
	 参数     : [IN] matchKey    : SDK内部生成，下载或发送消息OUT 的matchKey
     返回值   : 无
     *******************************************************************************/
	EC_CALL_API void CancelUploadOrDownloadNOW(unsigned int matchKey);

	 /*! @function
     ********************************************************************************
     函数名: DeleteMessage
     功能  : 删除消息
     参数  : [IN]  matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
	         [IN]  type     : 冗余字段
             [IN]  msgId    : 删除消息的ID
			 [IN]  extJson  : 扩展接口 {"cancelMsgs":[{
												"msgSender":"string 消息发送者",
												"msgId":"string 消息msgId",
												"msgDate":"string 消息时间"
											}]
										}

     返回值   : 0成功，非0失败
	 回调函数 ：void (*onDeleteMessage)
     *******************************************************************************/
     EC_CALL_API int DeleteMessage(unsigned int *matchKey,int type,const char* msgId);
	 EC_CALL_API int DeleteMessageEx(unsigned int *matchKey, int type, const char* msgId, const char *extJson);

	 /*! @function
	 ********************************************************************************
	 函数名: DeleteMessageGroup
	 功能  : 群删除消息(群使用此接口，兼容老版本)
	 参数  : [IN]  matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			 [IN]  type     : 冗余字段
			 [IN]  msgId    : 删除消息的ID
			 [IN]  extJson  : 扩展接口 {"groupId":"string 群组ID，用于撤回群消息","cancelMsgs":[{
												"msgSender":"string 消息发送者",
												"msgId":"string 消息msgId",
												"msgDate":"string 消息时间"
											}]
										}

	 返回值   : 0成功，非0失败
	 回调函数 ：void (*onDeleteMessage)
	 *******************************************************************************/
	 EC_CALL_API int DeleteMessageGroup(unsigned int *matchKey, int type, const char* msgId);
	 EC_CALL_API int DeleteMessageGroupEx(unsigned int *matchKey, int type, const char* msgId, const char *extJson);

	 /*! @function
     ********************************************************************************
     函数名: WithDrawMessage
     功能  : 撤回消息
     参数  : [IN]  matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
	         [IN]  type     : 冗余字段
             [IN]  msgId    : 撤回消息的ID
			 [IN]  extJson  : 扩展接口 {"cancelMsgs":[{
												"msgSender":"string 消息发送者",
												"msgId":"string 消息msgId",
												"msgDate":"string 消息时间"
											}]
										}

     返回值   : 0成功，非0失败
	 回调函数 ：void (*onWithDrawMessage)
     *******************************************************************************/
     EC_CALL_API int WithDrawMessage(unsigned int *matchKey,const char* msgId,int type);
	 EC_CALL_API int WithDrawMessageEx(unsigned int *matchKey, const char* msgId, int type, const char *extJson);

	 /*! @function
	 ********************************************************************************
	 函数名: WithDrawMessageGroup
	 功能  : 群撤回消息(群使用此接口，兼容老版本)
	 参数  : [IN]  matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			 [IN]  type     : 冗余字段
			 [IN]  msgId    : 撤回消息的ID
			 [IN]  extJson  : 扩展接口 {"groupId":"string 群组ID，用于撤回群消息","cancelMsgs":[{
												"msgSender":"string 消息发送者",
												"msgId":"string 消息msgId",
												"msgDate":"string 消息时间"
											}]
										}

	 返回值   : 0成功，非0失败
	 回调函数 ：void (*onWithDrawMessage)
	 *******************************************************************************/
	 EC_CALL_API int WithDrawMessageGroup(unsigned int *matchKey, const char* msgId, int type);
	 EC_CALL_API int WithDrawMessageGroupEx(unsigned int *matchKey, const char* msgId, int type, const char *extJson);

	 /*! @function
	 ********************************************************************************
	 函数名: ReadMessage
	 功能  : 设置消息已读
	 参数  : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			 [IN]  messageId   : 消息id
	 返回值   : 0成功，非0失败
	 回调函数 ：void (*onReadMessage)
	 *******************************************************************************/
	 EC_CALL_API int ReadMessage(unsigned int* matchKey, const char* messageId);

	 /*! @function
	 ********************************************************************************
	 函数名: ReadMessageGroup
	 功能  : 群设置消息已读(群使用此接口，兼容老版本)
	 参数  : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			 [IN]  messageId   : 消息id
	 返回值   : 0成功，非0失败
	 回调函数 ：void (*onReadMessage)
	 *******************************************************************************/
	 EC_CALL_API int ReadMessageGroup(unsigned int* matchKey, const char* messageId);
	 
	 /*! @function
	 ********************************************************************************
	 函数名: ReadVoiceMessage
	 功能  : 设置语音消息已读(回放)
	 参数  : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			 [IN]  messageId   : 消息id
	 返回值   : 0成功，非0失败
	 回调函数 ：void (*onReadVoiceMessage)
	 *******************************************************************************/
	 EC_CALL_API int ReadVoiceMessage(unsigned int* matchKey, const char* messageId);

	 /*! @function
	 ********************************************************************************
	 函数名: ReadVoiceMessageGroup
	 功能  : 群设置语音消息已读(回放)(群使用此接口，兼容老版本)
	 参数  : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			 [IN]  messageId   : 消息id
	 返回值   : 0成功，非0失败
	 回调函数 ：void (*onReadVoiceMessage)
	 *******************************************************************************/
	 EC_CALL_API int ReadVoiceMessageGroup(unsigned int* matchKey, const char* messageId);

	 /*! @function
     ********************************************************************************
     函数名   : SetTopContact
     功能     : 设置会话置顶
     参数     : [IN]  matchKey : 回传流水号
               [IN]  contact : 用户账号
               [IN]  isTop : 是否置顶
     返回值   : 0成功，非0失败
     回调函数 ：void (*onSetTopContact)(unsigned int clientNo, int reason)
     *******************************************************************************/
    EC_CALL_API int SetTopContact(unsigned int* matchKey, const char* contact, bool isTop);
   
    /*! @function
     ********************************************************************************
     函数名   : GetTopContact
     功能     : 获取置顶联系人列表
     参数     : [IN]  tcpMsgIdOut : 回传流水号
     返回值   : 0成功，非0失败
     回调函数 ：void (*onGetTopContact)(unsigned int clientNo, int reason, const char *jsonString)
     *******************************************************************************/
    EC_CALL_API int GetTopContact(unsigned int* matchKey);

	/****************************群组******************************/
  
	/*! @function
     ********************************************************************************
     函数名   : CreateGroup（旧接口）
     功能     : 创建群组
     参数     : [OUT] matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupName : 群组名
                [IN]  type : 群组类型 （同学、朋友、同事等）1: 同学  2: 朋友 3: 同事
                [IN]  province : 省份
                [IN]  city : 城市
                [IN]  scope : 群组规模 1:(上限100人) 2:上限300人 3:(上限500人) 4:(上限1000人) 5:(上限2000人)
                [IN]  declared : 群公告
                [IN]  permission : 群组权限:1直接加入 2需要身份验证 3私有群组
                [IN]  isDismiss  : 创建者退出，群组是否解散 1:不解散 2：解散
                [IN]  groupDomain : 群备注，用于用户扩展字段
				[IN]  isDiscuss : 是否讨论组模式
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onCreateGroup)
     *******************************************************************************/
    EC_CALL_API int CreateGroup(unsigned int *matchKey, const char*groupName, int type, const char* province, const char* city, int scope, const char* declared, int permission, int isDismiss, const char* groupDomain, bool isDiscuss);

	/*! @function
	********************************************************************************

	函数名   : CreateGroupEX （旧接口）
	功能     : 创建群组。依赖新版本服务端
	参数     : [OUT] matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
	[IN]  groupName : 群组名
	[IN]  type : 群组类型 （同学、朋友、同事等）1: 同学  2: 朋友 3: 同事
	[IN]  province : 省份
	[IN]  city : 城市
	[IN]  scope : 群组规模 1:(上限100人) 2:上限300人 3:(上限500人) 4:(上限1000人) 5:(上限2000人)
	[IN]  declared : 群公告
	[IN]  permission : 群组权限:1直接加入 2需要身份验证 3私有群组
	[IN]  isDismiss  : 创建者退出，群组是否解散 1:不解散 2：解散
	[IN]  groupDomain : 群备注，用于用户扩展字段
	[IN]  isDiscuss : 是否讨论组模式
	[IN]  isManage :是否仅群主和管理员可管理群 1:否 2:是 缺省1
	[IN]  isAtAll : 是否仅群主和管理员可@所有人 1:否 2:是 缺省1
	[IN]  inviteOperation 普通成员是否可拉人入群 1:是 2:否 缺省1
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onCreateGroup)
	*******************************************************************************/
	EC_CALL_API int CreateGroupEX(unsigned int *matchKey, const char*groupName, int type, const char* province, const char* city, int scope, const char* declared, int permission, int isDismiss, const char* groupDomain, bool isDiscuss, int isManage, int isAtAll,int inviteOperation);
	
	/*! @function
	********************************************************************************
	函数名   : CreateGroup_S
	功能     : 创建群组。依赖新版本服务端
	参数     : [OUT] matchKey         : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
			   [IN]  pGroupDetailInfo : 群组详情信息结构体
	返回值   : 0成功； 非0失败
	回调函数 ：void (*onModifyGroup)
	*******************************************************************************/
	EC_CALL_API int CreateGroup_S(unsigned int *matchKey, ECGroupDetailInfo* pGroupDetailInfo);

	/*! @function
     ********************************************************************************
     函数名   : DismissGroup
     功能     : 解散群组
     参数     : [OUT] matchKey  : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid	: 群组id
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onDismissGroup)
     *******************************************************************************/
    EC_CALL_API int DismissGroup(unsigned int *matchKey, const char* groupid);
    
    /*! @function
     ********************************************************************************
     函数名   : QuitGroup
     功能     : 退出群组
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 群组id
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onQuitGroup)
     *******************************************************************************/
    EC_CALL_API int QuitGroup(unsigned int *matchKey, const char* groupid);
    
    /*! @function
     ********************************************************************************
     函数名   : JoinGroup
     功能     : 加入群组
     参数     : [OUT] matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid  : 申请加入的群组Id
                [IN]  declared : 申请加入的理由
				[IN]  extJson : 入群扩展
						链接入群JSON格式：{"inviter":"","linkJoinFlag":1};
						二维码入群JSON格式：{"inviter":"","qrJoinFlag":1};

     返回值   : 0成功； 非0失败
     回调函数 ：void (*onJoinGroup)
     *******************************************************************************/
    EC_CALL_API int JoinGroup(unsigned int *matchKey, const char* groupid, const char* declared);
	EC_CALL_API int JoinGroupEx(unsigned int *matchKey, const char* groupid, const char* declared, const char *extJson);
    
	/*! @function
     ********************************************************************************
     函数名   : ReplyRequestJoinGroup
     功能     : 回复请求加入群组请求
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 申请加入的群组id
                [IN]  member  : 申请加入的成员id
                [IN]  confirm : 是否同意 1拒绝 2同意
				[IN]  extJson : 入群扩展
						链接入群JSON格式：{"inviter":"","linkJoinFlag":1};
						二维码入群JSON格式：{"inviter":"","qrJoinFlag":1};
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onReplyRequestJoinGroup)
     *******************************************************************************/
    EC_CALL_API int ReplyRequestJoinGroup(unsigned int *matchKey, const char* groupid, const char* member, int confirm);
	EC_CALL_API int ReplyRequestJoinGroupEx(unsigned int *matchKey, const char* groupid, const char* member, int confirm, const char *extJson);

	/*! @function
     ********************************************************************************
     函数名   : InviteJoinGroup
     功能     : 邀请加入群组
     参数     : [OUT] matchKey   : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid    : 邀请加入的群组id
                [IN]  declared    : 邀请理由
                [IN]  members    : 邀请加入的人
                [IN]  membercount: 邀请的人数
                [IN]  confirm    : 1 直接加入(不需要验证)； 2 需要对方验证
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onInviteJoinGroup)
     *******************************************************************************/
    EC_CALL_API int InviteJoinGroup(unsigned int *matchKey, const char* groupId, const char* declared, const char** members, int membercount, int confirm);
    
    /*! @function
     ********************************************************************************
     函数名   : ReplyInviteJoinGroup
     功能     : 回复邀请加入群组请求
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 邀请加入的群组id
                [IN]  invitor : 邀请加入的成员id
                [IN]  confirm : 是否同意 1拒绝 2同意
     返回值   : 0成功； 非0失败
     回调函数 ：(*onReplyInviteJoinGroup)
     *******************************************************************************/
    EC_CALL_API int ReplyInviteJoinGroup(unsigned int *matchKey, const char* groupid, const char* invitor, int confirm);
    
    /*! @function
     ********************************************************************************
     函数名   : QueryOwnGroup
     功能     : 获取自己加入的群组（分页处理）
     参数     : [OUT] matchKey      : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  borderGroupid : 已知页最新群组id
                [IN]  pageSize      : 每页数量（最多50）
				[IN]  target        : 1获取讨论组；2获取群组；125获取全部
     返回值   : 0成功； 非0失败
     回调函数 ：(*onQueryOwnGroup)
     *******************************************************************************/
    EC_CALL_API int QueryOwnGroup(unsigned int *matchKey, const char* borderGroupid,int pageSize, int target);
    
    /*! @function
     ********************************************************************************
     函数名   : QueryGroupDetail
     功能     : 获取群组详情
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 获取信息的群组id
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onQueryGroupDetail)
     *******************************************************************************/
    EC_CALL_API int QueryGroupDetail(unsigned int *matchKey, const char* groupId);
    
    /*! @function
     ********************************************************************************
     函数名   : ModifyGroup
     功能     : 管理员修改群组
     参数     : [OUT] matchKey         : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  pModifyGroupInfo : 修改群组信息结构体
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onModifyGroup)
     *******************************************************************************/
    EC_CALL_API int ModifyGroup(unsigned int *matchKey, ECModifyGroupInfo* pModifyGroupInfo);
    
    /*! @function
     ********************************************************************************
     函数名   : SearchPubliGroups
     功能     : 搜索公共群组
     参数     : [OUT] matchKey   : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  searchType : 1根据GroupId，精确搜索 2根据GroupName，模糊搜索
                [IN]  keyword    : 搜索关键词
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onSearchPublicGroup)
     *******************************************************************************/
    EC_CALL_API int SearchPublicGroups(unsigned int *matchKey, int searchType, const char* keyword);
    
	    /*! @function
     ********************************************************************************
     函数名   : SearchPublicGroupsPaging
     功能     : 搜索公共群组（分页）
     参数     : [OUT] matchKey   : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  searchType : 1根据GroupId，精确搜索 2根据GroupName，模糊搜索
                [IN]  keyword    : 搜索关键词
                [IN]  pageNo     : 搜索分页索引。群组名称搜索时,第几页数据 默认为1
                [IN]  pageSize   : 搜索分页大小。群组名称搜索时,每页数据条数，默认为10
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onSearchPublicGroupPaging)
     *******************************************************************************/
    EC_CALL_API int SearchPublicGroupsPaging(unsigned int *matchKey, int searchType, const char* keyword, int pageNo, int pageSize);
    
    /*! @function
     ********************************************************************************
     函数名   : QueryGroupMember
     功能     : 获取群组成员（分页处理）
     参数     : [OUT] matchKey     : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid      : 群组id
                [IN]  borderMember : 已知页最新成员id
                [IN]  pageSize     : 每页数量（最多50）
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onQueryGroupMember)
     *******************************************************************************/
    EC_CALL_API int QueryGroupMember(unsigned int *matchKey, const char* groupId, const char* borderMember,int pageSize);
    
    /*! @function
     ********************************************************************************
     函数名   : DeleteGroupMember
     功能     : 删除群组成员
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 删除成员的群组id
                [IN]  member  : 删除的成员,多人时需用逗号拼接
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onDeleteGroupMember)
     *******************************************************************************/
    EC_CALL_API int DeleteGroupMember(unsigned int *matchKey, const char* groupid, const char* member);
    
    /*! @function
     ********************************************************************************
     函数名   : QueryGroupMemberCard
     功能     : 查询群组成员详情
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 成员所属群组id
                [IN]  member  : 查询的成员id
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onQueryGroupMemberCard)
     *******************************************************************************/
    EC_CALL_API int QueryGroupMemberCard(unsigned int *matchKey, const char* groupid, const char* member);
    
    /*! @function
     ********************************************************************************
     函数名   : ModifyMemberCard
     功能     : 管理员修改群组成员信息
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  ECGroupMemberCard 群成员名片结构体
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onModifyGroupMemberCard)
     *******************************************************************************/
    EC_CALL_API int ModifyMemberCard(unsigned int *matchKey, ECGroupMemberCard *card);
    
    /*! @function
     ********************************************************************************
     函数名   : ForbidMemberSpeak   (该函数即将过期，建议使用forbidMembersSpeak)
     功能     : 群组成员禁言
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 成员所属群组id
                [IN]  member  : 成员id
                [IN]  isBan   : 1允许发言 2禁止发言
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onForbidMemberSpeakGroup)
     *******************************************************************************/
    EC_CALL_API int ForbidMemberSpeak(unsigned int *matchKey, const char* groupid, const char* member, int isBan);
    
    
    /*! @function
     ********************************************************************************
     函数名   : ForbidMembersSpeak。
     功能     : 批量群组成员禁言  。该功能依赖服务端新版本。
     参数     : [IN]  matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
     [IN]  groupid : 成员所属群组id
     [IN]  members : 成员id
     [IN]  membersCount : 群成员数
     [IN]  isBan : 1允许发言 2禁止发言
     [IN]  allForbid : 0:单人禁言 1:除操作者外全部禁言 缺省0 。设置除管理员及群主外全部禁言时参数members传空、membersCount传0。
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onForbidMembersSpeakGroup);
     *******************************************************************************/
    EC_CALL_API int ForbidMembersSpeak( unsigned int* matchKey, const char* groupid, const char** members,int membersCount, int isBan,int allForbid);

    
    /*! @function
     ********************************************************************************
     函数名   : SetGroupMessageRule
     功能     : 设置群组消息规则。
     参数     : [OUT] matchKey: SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  groupid : 群组id
                [IN]  notice  : 消息提示设置 true 提示 false不提示
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onSetGroupMessageRule)
     *******************************************************************************/
    EC_CALL_API int SetGroupMessageRule(unsigned int *matchKey, const char* groupid, bool notice);


	/******************************************************************************/
	/******************************************************************************/
		/*! @function
	********************************************************************************
	函数名   : StartVoiceRecording
	功能     : 开始录制语音消息
	参数     : [IN]  fileName	   : 录音文件保存的全路径，含后缀名.amr
	           [IN]  sessionId     : 透传会话ID，在回调中原封不动返回。可以为NULL
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：void (*onRecordingAmplitude)
	*******************************************************************************/
    EC_CALL_API int StartVoiceRecording(const char* fileName,const char* sessionId);

	/*! @function
	********************************************************************************
	函数名   : StopVoiceRecording
	功能     : 停止录制语音消息
	参数     : 无
	返回值   : 无
	回调函数 ：void (*onRecordingTimeOut)
	*******************************************************************************/
    EC_CALL_API void StopVoiceRecording();
	
	/*! @function
	********************************************************************************
	函数名   : PlayVoiceMsg
	功能     : 播放语音消息
	参数     : [IN]  fileName  : 录音文件保存的全路径，含后缀名.amr
	           [IN]  sessionId : 透传会话ID，在回调中原封不动返回。可以为NULL
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int PlayVoiceMsg(const char* fileName,const char* sessionId);

	/*! @function
	********************************************************************************
	函数名   : StopVoiceMsg
	功能     : 停止播放语音消息
	参数     : 无
	返回值   : 无
	回调函数 ：void (*onFinishedPlaying)
	*******************************************************************************/
	EC_CALL_API void StopVoiceMsg();

	/*! @function
	********************************************************************************
	函数名   : GetVoiceDuration
	功能     : 获取语音消息时长
	参数     : [IN]  fileName	  : 录音文件保存的全路径，含后缀名.amr
	           [IN]  duration	  : 语音消息播放时长,单位毫秒
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int GetVoiceDuration(const char* fileName,int *duration);

	/*! @function
	********************************************************************************
	函数名   : GetMediaDuration
	功能     : 获取媒体文件时长
	参数     : [IN]  fileName	  : 媒体文件名(全路径)
			   [IN]  fileType	  : -1 默认 0 图片 1 视频 2 音频
			   [IN]  duration	  : 媒体时长,单位毫秒
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int GetMediaDuration(const char* fileName, int fileType, int *duration);
	
	/*! @function
	********************************************************************************
	函数名   : PrintScreen
	功能     : 屏幕截图
	参数     : [IN]  width      ：截屏矩形的宽度
			   [IN]  height     ：截屏矩形的高度
			   [IN]  x          : 截屏时起始x坐标
			   [IN]  y          : 截屏时起始y坐标
	返回值   : 无
	*******************************************************************************/
	EC_CALL_API void PrintScreen(int x, int y, int width, int height);
		
	/*! @function
	********************************************************************************
	函数名   : PrintScreen
	功能     : 屏幕截图另存为
	参数     : [IN]  fileName   : 截屏图片的默认名称(以时间命名)
			   [IN]  filePath   ：允许用户指定路径，否则保存在安装目录下的 /jt/ 目录下
			   [IN]  fileType   ：文件类型，默认是png格式  1：png  2：bmp  3：jpg
	返回值   : 无
	*******************************************************************************/
	EC_CALL_API void SaveAsPic(const char* fileName, const char* filePath, int fileType);

	/*! @function
	********************************************************************************
	函数名   : DecryptTool
	功能     : 解密。输入字节流，输出字符串
	参数     : [out] outData     : 解密后内容。字符，需要外部分配内存，至少需要比intSize多1
			   [IN]  outSize	 : 外部分配内存数值
			   [IN]  inData      : 需要解密内容。字节
			   [IN]  inSize     : 需要解密内容长度
	返回值   : 0成功，非0失败
	*******************************************************************************/
	EC_CALL_API int DecryptTool(const char* outData,int outSize,const char* inData, int inSize);
	
	/*! @function
	********************************************************************************
	函数名   : DecryptBase64Tool
	功能     : base64解码后解密。输入字符串，输出字符串
	参数     : [out] outData     : 解密后内容。字符，需要外部分配内存，至少需要比intSize多1
			   [IN]  outSize	 : 外部分配内存数值
			   [IN]  inData      : 需要解密内容。字符
	返回值   : 0成功，非0失败
	*******************************************************************************/
	EC_CALL_API int DecryptBase64Tool(const char*  outData,int outSize,const char* inData);

	/*! @function
	********************************************************************************
	函数名   : UncompressBase64Tool
	功能     : base64解码后解压缩。输入字符串，输出字符串
	参数     : [out] outData     : 解压缩后内容。字符串，需要外部分配内存，至少需要比压缩前源字符串长度多1,用于底层做'\0'字符串结尾
			   [IN]  outSize	 : 外部分配内存数值。至少需要比压缩前源字符串长度多1
			   [IN]  inData      : 需要解压缩内容。字符
	返回值   : 0成功，非0失败
	*******************************************************************************/
	EC_CALL_API int UncompressBase64Tool(const char*  outData,int outSize,const char* inData);

	 /*! @function
     ********************************************************************************
     函数名   : SetGroupMemberRole  (该函数即将过期，建议使用setGroupMembersRole)
     功能     : 设置群组成员权限
     参数     : [IN]  matchKey    : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
                [IN]  groupid     : 群组id
                [IN]  member      : 群成员号
                [IN]  role        : 2管理员 3普通成员
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onSetGroupMemberRole)(unsigned int matchKey, int reason);
     *******************************************************************************/
    EC_CALL_API int SetGroupMemberRole(unsigned int* matchKey, const char* groupId, const char* member, int role);
    
    /*! @function
     ********************************************************************************
     函数名   : setGroupMembersRole
     功能     : 批量设置群组成员权限  。该功能依赖服务端新版本。
     参数     : [IN]  matchKey : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
     [IN]  groupid : 群组id
     [IN]  members : 群成员号
     [IN]  membersCount : 群成员数
     [IN]  role : 2管理员 3普通成员
     返回值   : 0成功； 非0失败
     回调函数 ：void (*onSetGroupMembersRole);
     *******************************************************************************/
    EC_CALL_API int  SetGroupMembersRole(unsigned int* matchKey, const char* groupId, const char** members, int membersCount,int role);


	/*! @function
	*********************************************************************************
	函数名    : UploadVTMFile
	功能      : 上传到VTM
	参数      : [IN] matchKey         : 回传流水号
	            [IN] fileName         : 附件全路径
	            [IN] extJson		  : 备用.

	返回值   : 0成功，非0失败
	回调函数 ：void (*onUploadVTMFileOrBuf)( unsigned int matchKey, int reason, const char* fileUrl)
	***********************************************************************/
	EC_CALL_API int UploadVTMFile(unsigned int* matchKey, const char* fileName, const char* extJson);

	/*! @function
	************************************************************************
	函数名   : UploadVTMBuf
	功能     : 上传到VTM
	参数     : [IN]  fileIdOut      : 回传流水号
			   [IN]  fileName       : 附件名称
			   [IN]  buf			: 附件数据
			   [IN]  size			: 附件长度
			   [IN]  extJson		: 备用.

	返回值   : 0成功，非0失败
	回调函数 ：void (*onUploadVTMFileOrBuf)( unsigned int fileIdOut,int reason, const char* fileUrl)
	***********************************************************************/
	EC_CALL_API int UploadVTMBuf(unsigned int* matchKey,const char* fileName,unsigned char* buf,unsigned int size, const char* extJson);

	 /*! @function
     ********************************************************************************
     函数名   : setConfirmMsgVersionFrequency
     功能     : 向服务器上报当前消息最大版本号频率。
	 参数     : [IN]  num		  : 频率。底层默认10条上报一次，这里用户可以根据需要设置上报频率
     返回值   : 0成功； 非0失败
	 回调函数 ：
     *******************************************************************************/
	EC_CALL_API int SetConfirmMsgVersionFrequency(int num);

	 /*! @function
     ********************************************************************************
     函数名   : SetFetchMessageFromLast
     功能     : 设置本地消息版本和历史版本号不一致时，拉历史消息版本号的起始点。
	 参数     : [IN]  bLast		  : true   表示以本地版本号为起始点拉取，拉取消息量以本地版本为标准
									false  表示以服务器的历史版本号为起始点拉取，拉取消息以服务器为标准
     返回值   : 无
	 回调函数 ：
     *******************************************************************************/
	EC_CALL_API void SetFetchMessageFromLast(bool bLast);

	 /*! @function
     ********************************************************************************
     函数名   : SetFetchMaxMsgsEveryTime
     功能     : 设置每次拉取最大离线消息数。
	 参数     : [IN]  nMaxMsgs	: 每次拉取的最大消息数，默认最大拉取10条
     返回值   : 无
	 回调函数 ：
     *******************************************************************************/
	EC_CALL_API void SetFetchMaxMsgsEveryTime(int nMaxMsgs);

	/*! @function
	********************************************************************************
	函数名   : SdkSetting
	功能     : 给SDK设置一些参数的通用接口。目前可以设置每次从服务器拉取最大离线消息数。
	参数     : [IN]  pSettingJson	: 设置SDK的json格式参数。
									  目前设置新的拉取消息版本号JSON串格式：{
																			"newFetchVersion":	"124",
																			"envType":	"1",
																			"userName":	"1869922332",
																			"appId":	"abcdefgfgsgsggsfgsg"
																		 }
									 在设置拉消息版本号时，如果想设置拉取离线消息，则必须在SDK登录之前，而且以上这四个参数都需要设。
									 如果不是设置拉取离线消息的话，可以只设版本号参数即可: { "newFetchVersion":	"124" }，且可以随时设置。
									 其中envType参数同SetServerEnvType这个借口的nEnvType参数。
	返回值   : 0成功； 非0失败
	回调函数 ：
	*******************************************************************************/
	EC_CALL_API int SdkSetting(char *pSettingJson);

#ifdef __cplusplus
}
#endif

#endif
