#ifndef _EC_IM_STRUCT_DEFINE_H
#define _EC_IM_STRUCT_DEFINE_H

#include "ECStructDef.h"

typedef enum
{
    MCMEventType_UserEvt_StartAsk = 1,
    MCMEventType_UserEvt_EndAsk = 2,
    MCMEventType_UserEvt_SendMSG = 3,
    MCMEventType_UserEvt_SendMail = 4,
    MCMEventType_UserEvt_SendWXMsg = 5,
    MCMEventType_UserEvt_GetAGList = 6,
    MCMEventType_UserEvt_RespAGList = 7,
    MCMEventType_UserEvt_IRCN = 8,
    MCMEventType_UserEvt_SendMCM = 9,
    MCMEventType_NotifyUser_QueueInfo = 10,
    MCMEventType_NotifyUser_StartAskResp = 11,
    MCMEventType_NotifyUser_EndAskResp = 12,
    MCMEventType_NotifyUser_StartConf = 13,
    MCMEventType_NotifyUser_StopConf = 14,
    MCMEventType_NotifyUser_EndAsk = 15,
    MCMEventType_NotifyUser_IRItemList = 16,
    MCMEventType_UserEvt_SelectItem = 17,
    MCMEventType_NotifyUser_InvestigateData = 20,
    MCMEventType_UserEvt_SubmitInvestigate = 21,
    MCMEventType_UserEvt_ServiceUpgrade = 22,
    MCMEventType_NotifyAgent_ServiceUpgradeResp = 23,
    MCMEventType_AgentEvt_KFOnWork = 47,
    MCMEventType_AgentEvt_KFOffWork = 49,
    MCMEventType_AgentEvt_KFStateOpt = 51,
    MCMEventType_NotifyAgent_KFStateResp = 52,
    MCMEventType_AgentEvt_SendMCM = 53,
    MCMEventType_AgentEvt_TransKF = 55,
    MCMEventType_NotifyAgent_TransKFResp = 56,
    MCMEventType_AgentEvt_EnterCallService = 57,
    MCMEventType_NotifyAgent_EnterCallSerResp = 58,
    MCMEventType_NotifyAgent_NewUserAsk = 59,
    MCMEventType_NotifyAgent_UserEndAsk = 60,
    MCMEventType_NotifyAgent_ImHistory = 61,
    MCMEventType_AgentEvt_Ready = 65,
    MCMEventType_AgentEvt_NotReady = 66,
    MCMEventType_AgentEvt_StartSerWithUser = 67,
    MCMEventType_AgentEvt_StopSerWithUser = 68,
    MCMEventType_AgentEvt_TransferQueue = 69,
    MCMEventType_AgentEvt_StartConf = 70,
    MCMEventType_AgentEvt_MakeCall = 71,
    MCMEventType_AgentEvt_AnswerCall = 72,
    MCMEventType_AgentEvt_ReleaseCall = 73,
    MCMEventType_AgentEvt_SendNotify = 74,
    MCMEventType_AgentEvt_ExitConf = 75,
    MCMEventType_NotifyAgent_NewUserCallin = 76,
    MCMEventType_NotifyAgent_UserReleaseCall = 77,
    MCMEventType_NotifyAgent_UserCallEstablish = 80,
    MCMEventType_AgentEvt_RejectUser = 81,
    MCMEventType_NotifyAgent_RejectUserResp = 82,
    MCMEventType_NotifyAgent_StartConfResp = 83,
    MCMEventType_NotifyAgent_ExitConfResp = 84,
    MCMEventType_NotifyAgent_ExitConf = 85,
    MCMEventType_NotifyAgent_InviteJoinConf = 86,
    MCMEventType_AgentEvt_ForceJoinConf = 87,
    MCMEventType_NotifyAgent_TransferNewUser = 89,
    MCMEventType_NotifyAgent_TransferQueueResp = 90,
    MCMEventType_NotifyAgent_FroiceStartConf = 91,
    MCMEventType_AgentEvt_ForceTransfer = 92,
    MCMEventType_NotifyAgent_ForceTransferResp = 93,
    MCMEventType_NotifyAgent_ForceTransfernewUser = 94,
    MCMEventType_NotifyAgent_CallState = 95,
    MCMEventType_AgentEvt_QueryQueueInfo = 97,
    MCMEventType_NotifyAgent_QueryQueueInfoResp = 98,
    MCMEventType_AgentEvt_ReservedForUser = 100,
    MCMEventType_NotifyAgent_ReservedForUserResp = 101,
    MCMEventType_AgentEvt_CancelReserved = 102,
    MCMEventType_NotifyAgent_CancelReservedResp = 103,
    MCMEventType_NotifyAgent_ReservedUserAsk = 104,
    MCMEventType_AgentEvt_StartSessionTimer = 105,
    MCMEventType_NotifyAgent_StartSessionTimerResp = 106,
    MCMEventType_NotifyAgent_STExpired = 107,
    MCMEventType_AgentEvt_MonitorAgent = 108,
    MCMEventType_NotifyAgent_MonitorAgentResp = 109,
    MCMEventType_AgentEvt_CancelMonitorAgent = 110,
    MCMEventType_NotifyAgent_CancelMonitorAgentResp = 111,
    MCMEventType_AgentEvt_QueryAgentInfo = 112,
    MCMEventType_NotifyAgent_QueryAgentInfoResp = 113,
    MCMEventType_AgentEvt_SerWithTheUser = 114,
    MCMEventType_AgentEvt_ForceEndService = 118,
    MCMEventType_NotifyAgent_ForceEndService = 119,
    MCMEventType_NotifyAgent_AgentJoinIM = 127,
    MCMEventType_NotifyAgent_AgentEndIMService = 128,
    MCMEventType_NotifyAgent_ExitIMService = 129,
    MCMEventType_NotifyAgent_TransferResult = 130,
}ECMCMEventType;

typedef enum
{
	Msg_Type_Unknown	            = 0,//未知类型
	Msg_Type_Text		            = 1,//文本消息
	Msg_Type_Voice		            = 2,//语音消息
	Msg_Type_Video		            = 3,//视频消息
	Msg_Type_Picture	            = 4,//图片消息
	Msg_Type_Position	            = 5,//位置消息
	Msg_Type_File		            = 6,//文件,底层默认压缩
	Msg_Type_File_UnCompress		= 7,//文件，底层不压缩
	Msg_Type_NetLink                = 8,//纯链接消息
	Msg_Type_GroupNty	            = 9,//群组通知
	Msg_Type_GroupAt                = 11,//群组中@成员
	Msg_Type_UserState              = 12,//用户输入状态
	Msg_Type_File_Big	            = 15,//大文件上传模式
	Msg_Type_ThirdSys				= 17,//外围特殊号消息
	Msg_Type_DeleteMessage          = 21,//删除消息
	Msg_Type_ReadNotify             = 24,//消息已读通知
	Msg_Type_WithDraw               = 25,//撤回消息
	Msg_Type_Command                = 26,//扩展 4个标记的默认值为： {"isSave": "1",//存储"isOfflinePush": "1",//走离线推送"isHint": "0",//不提示，即静默推送"isSyncMsg": "1" //多设备同步消息
	Msg_Type_LoginStateChange		= 29,// 用户在线状态更新
	Msg_Type_InviteConfNty          = 50,//新会议通知
	Msg_Type_FriendsNty             = 100,//好友关系
	Msg_Type_End
}MsgType;

//群组通知消息类型
typedef enum{
	NTUnknownNotice = -1,
	NTRequestJoinGroup,//申请加入群组
	NTInviteJoinGroup,//邀请加入群组
	NTMemberJoinedGroup,//成员加入群组
	NTDismissGroup,//解散群组
	NTQuitGroup,//退出群组
	NTRemoveGroupMember,//删除成员
	NTReplyRequestJoinGroup,//回复申请
	NTReplyInviteJoinGroup,//回复邀请
	NTModifyGroup,//修改群组信息
	NTChangeAdmin,//讨论组管理员退出后，服务器选择第一个被邀请加入的人作为管理员
	NTChangeMemberRole,//设置、取消管理员，转让群组
	NTModifyGroupMember,//修改群组成员信息
	NTInviteMembersJoinGroup,//邀请多人加入群组, 无需确认
	NTMemberMessageForbid,//成员禁言
	NTMemberCancelMessageForbid,//取消成员禁言
	NTMemberAllMembersMessageForbid,//全员禁言
	NTMemberCancelAllMembersMessageForbid,//取消全员禁言
	NTMemberCreateConferenceInGroup,//在群组创建会议
	NTMemberJoinConferenceInGroup,//在群组加入会议
	NTMemberQuitConferenceInGroup,//在群组离开会议
	NTMemberEndConferenceInGroup//在群组结束会议
}ECMessageNoticeCode;

typedef enum{
	NTOperateUnknownNotice = -1,
	NTDeleteMessage,
	NTWithdrawMessage
}ECOperateMessageNoticeCode;

typedef enum{
	MessageState_Receive = 0,
	MessageState_Send
}ECMessageState;

typedef enum {
	/** 添加好友通知 */
	ECFriendNoticeMsg_Type_AddFriend = 0,

	/** 直接成为好友通知 */
	ECFriendNoticeMsg_Type_BecomeFriend=1,

	/** 同意好友请求通知 */
	ECFriendNoticeMsg_Type_AgreeFriend=2,

	/** 拒绝好友通知 */
	ECFriendNoticeMsg_Type_RejectFriend=3,

	/** 删除好友通知 */
	ECFriendNoticeMsg_Type_DeleteFriend=4,
}ECSubType;

#pragma pack (4)
//消息
typedef struct _ECMessage
{
	MsgType msgType;   //消息类型消息类型 Msg_Type_Text:文本消息 Msg_Type_Voice：语音消息 Msg_Type_Video：视频消息  Msg_Type_Picture：图片消息  Msg_Type_Position：位置消息  Msg_Type_File：文件 
	char msgId[BUF_LEN_64];//消息ID
	char dateCreated[BUF_LEN_20];//服务器接收消息时间,毫秒数
	char sender[BUF_LEN_64]; //发送方
	char receiver[BUF_LEN_64]; //点对点时为接收者VoIP、群组消息时为群组ID
	char msgContent[BUF_LEN_8192];//内容
	char userData[BUF_LEN_4096 * 6];//扩展
	char senderNickName[BUF_LEN_128];//发送者昵称
	char fileName[BUF_LEN_8192];//文件名	
	char sessionId[BUF_LEN_64];//会话id
	char fileUrl[BUF_LEN_8192];//文件下载地址
	char userDataMsgId[BUF_LEN_64];//userData中传递的消息id
	int  sessionType;//会话类型:0 点对点，1 群组
	unsigned long long fileSize;//文件大小
	unsigned long long  offset;//偏移
	int isAt;//是否被发送者@了（ExtOpt中属性） 
	int type;//消息操作类型  0：阅后即焚  1：撤回  3：置为已读
	int isSave;//是否存储消息（ExtOpt中属性），默认1
	int isOfflinePush;//是否离线推送消息（ExtOpt中属性），默认1
	int isHint;//是否提示（ExtOpt中属性），默认0,不提示
	int isSyncMsg;//多设备同步消息（ExtOpt中属性），默认1
	int isReceiveOfflineMsg;//是否是离线消息。默认0，在附件回调onReceiveFile中用于判断是否是离线消息
	char title[BUF_LEN_512];//标题（ExtOpt中属性）
	char imagePath[BUF_LEN_4096];//网页中图片地址（ExtOpt中属性）
	char desc[BUF_LEN_4096];//描述（ExtOpt中属性）
	char url[BUF_LEN_4096];//预览消息网页源地址（ExtOpt中属性）
    unsigned long long originFileSize;//文件大小（ExtOpt中属性）
	char* offsetJson;//大文件模式下断点续传串。因为大文件越大，分片越多，这里用指针
	char apsAlert[BUF_LEN_4096];//用于自定义推送消息内容（ExtOpt中属性）,发送的时候在exopt中增加key apsalert
	ECMessageState state;//同步消息状态  

	int relateCount;//机器人推测关联问题数组个数
	char** relateArry;//机器人推测关联问题数组，目前只支持文本

	int loginState;	// msgType=29 此字段生效 0 登出 1 登入 sender代表改变状态的用户

	char* userDataEx;//用户数据大小是动态变化的，有时会超出userData字段定义的数组范围。后续会逐渐用userDataEx字段代码userData字段。
					 //目前为了兼容之前的用户，在数据没有超出6 * 4096的范围时会把这两个字段都填值，超出范围则只填userDataEx字段
	int userDataExSize;//userDataEx字段数据长度
	char serviceMsgId[BUF_LEN_64];//服务端消息id
	char replyMsgFlag[BUF_LEN_64];//是否存在回复消息.

	_ECMessage()
	{
		memset(this,0,sizeof(_ECMessage));
	}

	_ECMessage(const _ECMessage& rOther)
	{
		*this = rOther;
	}
}ECMessage;

//群组邀请多人通知列表
typedef struct _ECGroupInviteMembers
{
	char member[BUF_LEN_128];  //成员
	char nickName[BUF_LEN_128];//昵称 

	_ECGroupInviteMembers()
	{
		memset(this,0,sizeof(_ECGroupInviteMembers));
	}

	_ECGroupInviteMembers(const _ECGroupInviteMembers& rOther)
	{
		*this = rOther;
	}
}ECGroupInviteMembers;

//邀请成员加入失败成员及原因
typedef struct _ECFailedGroupMember
{
	char member[BUF_LEN_64];//成员id
	int  cause; //失败原因

	_ECFailedGroupMember()
	{
		memset(this, 0, sizeof(_ECFailedGroupMember));
	}

	_ECFailedGroupMember(const _ECFailedGroupMember& rOther)
	{
		*this = rOther;
	}
}ECFailedGroupMember;

//搜索群组 
typedef struct _ECGroupSearchInfo
{
	char groupId[BUF_LEN_33];  //群组ID
	char name[BUF_LEN_128];    //群组名字
	char owner[BUF_LEN_128];   //群组创建者
	char declared[BUF_LEN_8192];//群组公告
	int  scope;        //群组规模 1：临时组(上限100人) 2普通组(上限300人)3：普通组(上限500人) 4：付费普通组 (上限1000人) 5：付费VIP组（上限2000人）
	int  permission;   //申请加入模式 1：默认可直接加入  2：需要身份验证    3:私有群组（不能主动加入，仅能管理员邀请）
	int  memberCount;  //群组的成员人数
	char discuss;		//是否是讨论组
	_ECGroupSearchInfo()
	{
		memset(this,0,sizeof(_ECGroupSearchInfo));
	}

	_ECGroupSearchInfo(const _ECGroupSearchInfo& rOther)
	{
		*this = rOther;
	}

}ECGroupSearchInfo;

//获得自己的群组 
typedef struct _ECGroupSimpleInfo
{
	char groupId[BUF_LEN_33];  //群组ID
	char name[BUF_LEN_128];    //群组名字
	char owner[BUF_LEN_128];   //群组创建者
	char groupDomain[BUF_LEN_512];   //群组扩展信息（用于第三方应用传递自己的数据，原样返回）
	int  scope;        //群组规模 1：临时组(上限100人) 2普通组(上限300人)3：普通组(上限500人) 4：付费普通组 (上限1000人) 5：付费VIP组（上限2000人）
	int  permission;   //申请加入模式 1：默认可直接加入  2：需要身份验证    3:私有群组（不能主动加入，仅能管理员邀请）
	int  memberCount;  //群组的成员人数
	int  isNotice;	   //用来表示是否需要提醒消息。1：提醒；2：不提醒
	char discuss;//是否是讨论组
	int  type;   //群组类型 （同学、朋友、同事等）1: 同学  2: 朋友 3: 同事
	int  isManage; //是否仅群主和管理员可管理群 1:否 2:是
	int  isAtAll; //是否仅群主和管理员可@所有人 1:否 2:是
	int  isForbid; //禁言标识 0:非禁言 1：禁言
	int  inviteOperation;//普通成员是否可拉人入群 1:是 2:否 
	int  checkAdminFlag;//入群是否需要群主与管理员审核 1:是 2:否
	int  pushQuitGroupMsg; //是否开启推送退群通知 1:是   2:否 缺省2.
	int  showNickName;//是否需要显示群组中成员昵称 1显示 2关闭 缺省1.
	//群功能新增禁止退群功能、禁止修改昵称、禁止设置聊天背景.
	int  isQuit; //是否允许群员退群 1:是、2:否.
	int  isUpdateNikeName; //是否允许群员修改昵称 1:是、2:否.
	int  isSetBackGround; //是否允许群员设置背景图片 1:是、2:否.

	_ECGroupSimpleInfo()
	{
		memset(this,0,sizeof(_ECGroupSimpleInfo));
	}

	_ECGroupSimpleInfo(const _ECGroupSimpleInfo& rOther)
	{
		*this = rOther;
	}

}ECGroupSimpleInfo;


//群组属性(详细信息) 
typedef struct _ECGroupDetailInfo
{
	char groupId[BUF_LEN_33];     //群组ID
	char name[BUF_LEN_128];       //群组名字
	char owner[BUF_LEN_128];      //群组创建者
	int  type;            //群组类型 （同学、朋友、同事等）1: 同学  2: 朋友 3: 同事
	char province[BUF_LEN_64];    //群组省份
	char city[BUF_LEN_64];        //群组地区
	int  scope;					//群组规模 1：临时组(上限100人) 2普通组(上限300人)3：普通组(上限500人) 4：普通组2 (上限1000人) 5：VIP组（上限2000人）
	char declared[BUF_LEN_8192];   //群组公告
	char dateCreated[BUF_LEN_20]; //该群组的创建时间
	int  memberCount;     //群组的成员人数
	int  isNotice;	      //用来表示是否需要提醒消息。1：提醒；2：不提醒
	int  permission;      //申请加入模式 1：默认可直接加入  2：需要身份验证    3:私有群组（不能主动加入，仅能管理员邀请）	
	char groupDomain[BUF_LEN_512];//群组扩展信息（用于第三方应用传递自己的数据，原样返回）
	char discuss;//是否是讨论组
    char groupPhoto[BUF_LEN_64]; //群头像
	int  isManage; //是否仅群主和管理员可管理群 1:否 2:是
	int  isAtAll; //是否仅群主和管理员可@所有人 1:否 2:是
	int  isForbid; //禁言标识 0:非禁言 1：禁言
	int  inviteOperation;//普通成员是否可拉人入群 1:是 2:否 
	int  isDismiss;		 //创建者退出，群组是否解散 1 : 不解散 2：解散
	int  checkAdminFlag;//入群是否需要群主与管理员审核 1:是 2:否
	int  pushQuitGroupMsg; //是否开启推送退群通知 1:是   2:否 缺省2.
	int  showNickName;//是否需要显示群组中成员昵称 1显示 2关闭 缺省1.
	//群功能新增禁止退群功能、禁止修改昵称、禁止设置聊天背景.
	int  isQuit; //是否允许群员退群 1:是、2:否.
	int  isUpdateNikeName; //是否允许群员修改昵称 1:是、2:否.
	int  isSetBackGround; //是否允许群员设置背景图片 1:是、2:否.

	_ECGroupDetailInfo()
	{
		memset(this,0,sizeof(_ECGroupDetailInfo));
	}

	_ECGroupDetailInfo(const _ECGroupDetailInfo& rOther)
	{
		*this = rOther;
	}

}ECGroupDetailInfo;

//修改群组信息 
typedef struct _ECModifyGroupInfo
{
	char groupId[BUF_LEN_33];     //群组ID
	char name[BUF_LEN_128];       //群组名字
	int  type;            //群组类型 （同学、朋友、同事等）1: 同学  2: 朋友 3: 同事
	char province[BUF_LEN_64];    //群组省份
	char city[BUF_LEN_64];        //群组地区
	int  scope;           //群组规模 1：临时组(上限100人) 2普通组(上限300人)3：普通组(上限500人) 4：付费普通组 (上限1000人) 5：付费VIP组（上限2000人）
	char declared[BUF_LEN_8192];   //群组公告
	int  permission;      //申请加入模式 1：默认可直接加入  2：需要身份验证    3:私有群组（不能主动加入，仅能管理员邀请）	
	char groupDomain[BUF_LEN_512];//群组扩展信息（用于第三方应用传递自己的数据，原样返回）
	char discuss;//是否是讨论组
    char groupPhoto[BUF_LEN_512]; //群组头像url

	//备注：依赖新版本服务端
	int  isManage; //是否仅群主和管理员可管理群 1:否 2:是
	int  isAtAll; //是否仅群主和管理员可@所有人 1:否 2:是
	int  inviteOperation; //普通成员是否可拉人入群 1:是 2:否 
	int  checkAdminFlag;//入群是否需要群主与管理员审核 1:是 2:否
	int  pushQuitGroupMsg; //是否开启推送退群通知 1:是   2:否 缺省2.
	int  isQuit; //是否允许群员退群 1:是、2:否.
	int  isUpdateNikeName; //是否允许群员修改昵称 1:是、2:否.
	int  isSetBackGround; //是否允许群员设置背景图片 1:是、2:否.

	_ECModifyGroupInfo()
	{
		memset(this,0,sizeof(_ECModifyGroupInfo));
		scope = 1;
		permission = 1;
		isManage = 0;
		isAtAll = 0;
	}

	_ECModifyGroupInfo(const _ECModifyGroupInfo& rOther)
	{
		*this = rOther;
	}

	_ECModifyGroupInfo& operator=(const _ECModifyGroupInfo& rOther);

}ECModifyGroupInfo;

//群成员属性 
typedef struct _GroupMember
{
	char member[BUF_LEN_64];  //成员
    char nickName[BUF_LEN_128];//昵称 
	int  speakState;  // 是否禁言  1:不禁言  2:禁言
	int  role;		  //角色  1:创建者  2:管理员  3：成员 
	int  sex ;        //性别 1:男 2：女
    char memberRole[BUF_LEN_128];//自定义角色
    
	_GroupMember()
	{
		memset(this,0,sizeof(_GroupMember));
	}

	_GroupMember(const _GroupMember& rOther)
	{
		*this = rOther;
	}

}ECGroupMember;

//群成员名片 。 
typedef struct _ECGroupMemberCard
{
	char member[BUF_LEN_64];  //被修改成员
	char groupId[BUF_LEN_33]; //所属群组ID
    char display[BUF_LEN_128];//显示名称 
	char phone[BUF_LEN_33];    //用户电话
	char mail[BUF_LEN_128];   //用户邮箱
	char remark[BUF_LEN_512]; //用户备注
	int  speakState;		  // 是否禁言  1:不禁言  2:禁言
	int  role;				  //角色  1:创建者  2:管理员  3：成员 
	int  sex ;				  //性别 1:男 2：女
    char memberRole[BUF_LEN_128];//群成员自定义角色
	int showNickName;			//是否显示群组成员昵称 1显示 2关闭 缺省1
	_ECGroupMemberCard()
	{
		memset(this,0,sizeof(_ECGroupMemberCard));
	}

	_ECGroupMemberCard(const _ECGroupMemberCard& rOther)
	{
		*this = rOther;
	}

	_ECGroupMemberCard& operator=(const _ECGroupMemberCard& rOther);

}ECGroupMemberCard;

typedef struct _ECMessageReceipt
{
	char useracc[BUF_LEN_128];
	char time[BUF_LEN_128];
	_ECMessageReceipt()
	{
		memset(this,0,sizeof(_ECMessageReceipt));
	}

	_ECMessageReceipt(const _ECMessageReceipt& rOther)
	{
		*this = rOther;
	}

	_ECMessageReceipt& operator=(const _ECMessageReceipt& rOther);

}ECMessageReceipt;

//管理员收到群员加入群组的申请
typedef struct _ECRequestJoinGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//时间戳。单位毫秒
	char declared[BUF_LEN_512];//申请理由
	char nickName[BUF_LEN_128];//昵称
	char proposer[BUF_LEN_64];//申请者id
	int confirm;//是否需要管理员确认 1不需要确认 2需要确认
	_ECRequestJoinGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECRequestJoinGroupNtyMsg));
	}

	_ECRequestJoinGroupNtyMsg(const _ECRequestJoinGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECRequestJoinGroupNtyMsg& operator=(const _ECRequestJoinGroupNtyMsg& rOther);

}ECRequestJoinGroupNtyMsg;

//群员收到管理员加入群组的邀请
typedef struct _ECInviteJoinGroupNtyMsg
{
	int confirm;//是否需要对方确认 1不需要确认 2需要确认
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char declared[BUF_LEN_512];//邀请理由
	char admin[BUF_LEN_64];//管理员
	char adminNickName[BUF_LEN_64];//管理员昵称
	char nickName[BUF_LEN_128];//昵称
	int groupType;//群组类型
	_ECInviteJoinGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECInviteJoinGroupNtyMsg));
	}

	_ECInviteJoinGroupNtyMsg(const _ECInviteJoinGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECInviteJoinGroupNtyMsg& operator=(const _ECInviteJoinGroupNtyMsg& rOther);

}ECInviteJoinGroupNtyMsg;

//成员收到禁言或者解除禁言的通知
typedef struct _ECMemberForbidGroupNtyMsg
{
	int confirm;//是否需要对方确认 1不需要确认 2需要确认
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char declared[BUF_LEN_512];//邀请理由
	char admin[BUF_LEN_64];//管理员
	char adminNickName[BUF_LEN_64];//管理员昵称
	char nickName[BUF_LEN_128];//昵称
	char member[BUF_LEN_64];//加入者id
	_ECMemberForbidGroupNtyMsg()
	{
		memset(this, 0, sizeof(_ECInviteJoinGroupNtyMsg));
	}

	_ECMemberForbidGroupNtyMsg(const _ECMemberForbidGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECMemberForbidGroupNtyMsg& operator=(const _ECMemberForbidGroupNtyMsg& rOther);

}ECMemberForbidGroupNtyMsg;

//全员收到禁言或者解除禁言的通知
typedef struct _ECAllMemberForbidGroupNtyMsg
{
	int confirm;//是否需要对方确认 1不需要确认 2需要确认
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char declared[BUF_LEN_512];//邀请理由
	char admin[BUF_LEN_64];//管理员
	char nickName[BUF_LEN_128];//昵称
	char member[BUF_LEN_64];//加入者id
	char adminNickName[BUF_LEN_64];//管理员昵称
	_ECAllMemberForbidGroupNtyMsg()
	{
		memset(this, 0, sizeof(_ECInviteJoinGroupNtyMsg));
	}

	_ECAllMemberForbidGroupNtyMsg(const _ECAllMemberForbidGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECAllMemberForbidGroupNtyMsg& operator=(const _ECAllMemberForbidGroupNtyMsg& rOther);

}ECAllMemberForbidGroupNtyMsg;

//群组中的会议通知
typedef struct _ECConferenceInGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char admin[BUF_LEN_64];//管理员
	char nickName[BUF_LEN_128];//昵称
	char adminNickName[BUF_LEN_64];//管理员昵称
	int memberCount;
	ECGroupInviteMembers* members;

	_ECConferenceInGroupNtyMsg()
	{
		memset(this, 0, sizeof(_ECConferenceInGroupNtyMsg));
	}

	_ECConferenceInGroupNtyMsg(const _ECConferenceInGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECConferenceInGroupNtyMsg& operator=(const _ECConferenceInGroupNtyMsg& rOther);

}ECConferenceInGroupNtyMsg;

//同时邀请多个人加入群组的通知
typedef struct _ECInviteMembersNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char declared[BUF_LEN_512];//邀请理由
	char admin[BUF_LEN_64];//管理员id
	char adminGroupName[BUF_LEN_512];//管理员群昵称
	int memberCount;
	ECGroupInviteMembers* members;
	int groupType;//群组类型

	_ECInviteMembersNtyMsg()
	{
		memset(this,0,sizeof(_ECInviteMembersNtyMsg));
	}

	_ECInviteMembersNtyMsg(const _ECInviteMembersNtyMsg& rOther)
	{
		*this = rOther;
	}

}ECInviteMembersNtyMsg;

//群员收到有新群员加入了群的通知
typedef struct _ECMemberJoinedGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//加入者id
	char declared[BUF_LEN_512];//加入理由
	char nickName[BUF_LEN_128];//昵称
	int groupType;//群组类型

	_ECMemberJoinedGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECMemberJoinedGroupNtyMsg));
	}

	_ECMemberJoinedGroupNtyMsg(const _ECMemberJoinedGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECMemberJoinedGroupNtyMsg& operator=(const _ECMemberJoinedGroupNtyMsg& rOther);

}ECMemberJoinedGroupNtyMsg;

//解散群组
typedef struct _ECDismissGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	int groupType;//群组类型
	_ECDismissGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECDismissGroupNtyMsg));
	}

	_ECDismissGroupNtyMsg(const _ECDismissGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECDismissGroupNtyMsg& operator=(const _ECDismissGroupNtyMsg& rOther);

}ECDismissGroupNtyMsg;

//成员退出群组
typedef struct _ECQuitGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//加入者id
	char nickName[BUF_LEN_128];//昵称
	int pushQuitGroupMsg;//是否开启推送退群通知 1:是   2:否 缺省2.
	_ECQuitGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECQuitGroupNtyMsg));
	}

	_ECQuitGroupNtyMsg(const _ECQuitGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECQuitGroupNtyMsg& operator=(const _ECQuitGroupNtyMsg& rOther);

}ECQuitGroupNtyMsg;

//踢出成员
typedef struct _ECRemoveGroupMemberNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//移除的成员id
	char nickName[BUF_LEN_128];//昵称
	char admin[BUF_LEN_64];//管理员
	char adminNickName[BUF_LEN_64];//管理员昵称
	int groupType;//群组类型
	_ECRemoveGroupMemberNtyMsg()
	{
		memset(this,0,sizeof(_ECRemoveGroupMemberNtyMsg));
	}

	_ECRemoveGroupMemberNtyMsg(const _ECRemoveGroupMemberNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECRemoveGroupMemberNtyMsg& operator=(const _ECRemoveGroupMemberNtyMsg& rOther);

}ECRemoveGroupMemberNtyMsg;

//管理员回复成员申请加入
typedef struct _ECReplyRequestJoinGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//加入的成员id
	char admin[BUF_LEN_64];//管理员
	char nickName[BUF_LEN_128];//昵称
	int confirm;//是否同意：1拒绝 2同意
	_ECReplyRequestJoinGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECReplyRequestJoinGroupNtyMsg));
	}

	_ECReplyRequestJoinGroupNtyMsg(const _ECReplyRequestJoinGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECReplyRequestJoinGroupNtyMsg& operator=(const _ECReplyRequestJoinGroupNtyMsg& rOther);

}ECReplyRequestJoinGroupNtyMsg;

//成员回复管理员邀请加入群
typedef struct _ECReplyInviteJoinGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//收到邀请的成员id
	char admin[BUF_LEN_64];//管理员
	char nickName[BUF_LEN_128];//昵称
	int confirm;//是否同意：1拒绝 2同意
	int ver;//如果ver=2,应用层直接抛弃掉消息

	_ECReplyInviteJoinGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECReplyInviteJoinGroupNtyMsg));
	}

	_ECReplyInviteJoinGroupNtyMsg(const _ECReplyInviteJoinGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECReplyInviteJoinGroupNtyMsg& operator=(const _ECReplyInviteJoinGroupNtyMsg& rOther);

}ECReplyInviteJoinGroupNtyMsg;

//修改群组信息
typedef struct _ECModifyGroupNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//修改者id
	char modifyDic[BUF_LEN_1024];//群组修改的信息
	char admin[BUF_LEN_64];//管理员
	char adminNickName[BUF_LEN_64];//管理员昵称

	_ECModifyGroupNtyMsg()
	{
		memset(this,0,sizeof(_ECModifyGroupNtyMsg));
	}

	_ECModifyGroupNtyMsg(const _ECModifyGroupNtyMsg& rOther)
	{
		*this = rOther;
	}

	_ECModifyGroupNtyMsg& operator=(const _ECModifyGroupNtyMsg& rOther);

}ECModifyGroupNtyMsg;

//修改群组成员信息通知
typedef struct _ECModifyGroupMemberNtyMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//被修改者id
	char nickName[BUF_LEN_128]; // 被修改者的昵称
	char modifyDic[BUF_LEN_1024];//群组修改的信息
	char admin[BUF_LEN_64];//管理员
	char adminNickName[BUF_LEN_64];//管理员昵称
	int groupType;//群组类型
	_ECModifyGroupMemberNtyMsg()
	{
		memset(this,0,sizeof(_ECModifyGroupMemberNtyMsg));
	}

	_ECModifyGroupMemberNtyMsg(const _ECModifyGroupMemberNtyMsg& rOther)
	{
		*this = rOther;
	}

}ECModifyGroupMemberNtyMsg;

typedef struct _GroupNoticeMessage{
	ECMessageNoticeCode notice;
	char msgId[BUF_LEN_64];
	void *pNoticeMsg;
	_GroupNoticeMessage():notice(NTUnknownNotice),pNoticeMsg(NULL)
	{

	}
}ECGroupNoticeMessage;

typedef struct _ECChangeMemberRoleMsg
{
	char sender[BUF_LEN_64];//发送通知消息的账号
	char groupId[BUF_LEN_33];//群组ID
	char groupName[BUF_LEN_128];//群组名
	char dateCreated[BUF_LEN_20];//发送消息时间。单位毫秒
	char member[BUF_LEN_64];//被修改者id
	char nickName[BUF_LEN_128];//昵称
	int role;//1.群主 2.管理员 3.成员
	char admin[BUF_LEN_64];//管理员
	char adminNickName[BUF_LEN_64];//管理员昵称
	int groupType;//群组类型
	_ECChangeMemberRoleMsg()
	{
		memset(this,0,sizeof(_ECChangeMemberRoleMsg));
	}

	_ECChangeMemberRoleMsg(const _ECChangeMemberRoleMsg& rOther)
	{
		*this = rOther;
	}

	_ECChangeMemberRoleMsg& operator=(const _ECChangeMemberRoleMsg& rOther);

}ECChangeMemberRoleMsg;

typedef struct _ECMcmCmdMessage {
    ECMCMEventType cmdEvent;
    char osAccount[BUF_LEN_64];//服务号
    char userAccount[BUF_LEN_64];//用户账号
    char nickName[BUF_LEN_128];//昵称
    int queueType;
    int upgradeQueueType;
} ECMcmCmdMessage;

//好友关系通知
typedef struct _ECFriendshipNotice
{
	char friendAcc[BUF_LEN_256];//好友
	char msg[BUF_LEN_1024];//通知内容
	char nickName[BUF_LEN_256];//昵称
	char remarkName[BUF_LEN_256]; //备注名
	char avatar[BUF_LEN_1024];//头像
	int dealState;//好友状态 0:非好友 1:好友
	int source;//好友来源. 1手机通讯录，2群聊，3搜索，4好友推荐，5扫一扫
	ECSubType subType;//通知类型

	_ECFriendshipNotice()
	{
		memset(this, 0, sizeof(_ECFriendshipNotice));
	}

	_ECFriendshipNotice(const _ECFriendshipNotice& rOther)
	{
		*this = rOther;
	}
}ECFriendshipNotice;

/****************************消息处理接口的回调******************************/
typedef void (*onOfflineMessageCount)(int count );//离线条数；
typedef int  (*onGetOfflineMessage)();//离线拉取条数。<0 全拉；0 不拉；大于0，只拉取最新的条数，
typedef void (*onOfflineMessageComplete)();//拉取离线成功
typedef void (*onReceiveOfflineMessage)(ECMessage *pMsg);//离线消息回调
typedef void (*onReceiveMessage)(ECMessage *pMsg);//实时消息回调
typedef void (*onReceiveFile)(ECMessage* pFileInfo);//用户收到发送者发送过来的文件等待用户决定是否下载文件的回调。该回调消息的消息类型(MsgType)默认是6
typedef void (*onDownloadFileComplete)(unsigned int matchKey, int reason, ECMessage *msg);//下载文件回调，下载完成后被调用（下载失败也会被调）。reason:0成功，其他报错；offset 内容大小偏移量
typedef void (*onRateOfProgressAttach)(unsigned int matchKey, unsigned long long rateSize,unsigned long long fileSize,ECMessage *msg);//上传下载文件进度。ratesize 已经完成进度大小（字节）；filezise 总文件大小（字节）
typedef void (*onSendTextMessage)(unsigned int matchKey, int reason,ECMessage *msg);//发送消息回调。reason：200成功，其他报错；
typedef void (*onSendMediaFile)(unsigned int matchKey, int reason,ECMessage *msg, const char* stausMsg);//上传文件回调，上传完成后被调用（上传失败也会被调）。reason:200成功，其他报错；offset 内容大小偏移量；stausMsg： reason对应的描述
typedef void (*onDeleteMessage)(unsigned int matchKey, int reason,int type,const char* msgId);//删除服务端消息。reason:200成功，其他报错；type:透传消息类型；msgId:
typedef void (*onReceiveNoVersionMessage)(ECMessage *pMsg);//无版本号消息
typedef void (*onReceiveOpreateNoticeMessage)(ECMessage *pMsg);//消息状态通知
typedef void (*onSetTopContact)(unsigned int matchKey, int reason);//设置会话置顶。reason：200成功，其他报错；
typedef void (*onGetTopContact)(unsigned int matchKey, int reason, int count, char** members);//获取置顶联系人列表。reason：200成功，其他报错；
typedef void (*onWithDrawMessage)(unsigned int matchKey, int reason);//消息撤回。reason：200成功，其他报错；
typedef void (*onFriendsNoticeMessage)(ECFriendshipNotice *notice, ECMessage *pMsg);//好友关系通知。notice 通知结构体指针，pMsg消息结构体指针，兼容老接口
typedef void (*onReadMessage)(unsigned int matchKey, int reason);//设置消息已读

typedef void (*onUploadVTMFileOrBuf)(unsigned int matchKey, int reason, const char* fileUrl);//上传VTM文件回调, fileIdOut：文件id, fileUrl:文件服务器保存地址
typedef void (*onReceiveServerUndefineMessage)(ECMessage *pMsg);//服务器未定义消息


/****************************群组接口对应的回调******************************/
typedef void (*onCreateGroup)(unsigned int matchKey, int reason, ECGroupDetailInfo *pInfo);//创建群组。matchKey 匹配主调键值；reason：200成功，其他报错；
typedef void (*onDismissGroup)(unsigned int matchKey, int reason,const char* groupid);//解散群组。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；
typedef void (*onQuitGroup)(unsigned int matchKey, int reason,const char* groupid);//退出群组。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；
typedef void (*onJoinGroup)(unsigned int matchKey, int reason,const char* groupid);//加入群组。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；
typedef void (*onReplyRequestJoinGroup)(unsigned int matchKey, int reason,const char* groupid,const char* member,int confirm);//回复请求加入群组。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；member 成员；confirm 1拒绝 2同意
typedef void (*onInviteJoinGroup)(unsigned int matchKey, int reason,const char* groupid,const char** members,int membercount,int confirm, int failedCount,ECFailedGroupMember* failedMembers);//邀请加入群组。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；members 成员数组；membercount 数组个数 ；confirm 1拒绝 2同意
typedef void (*onReplyInviteJoinGroup)(unsigned int matchKey, int reason,const char* groupid,const char* member,int confirm);//回复邀请加入群组。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；member 成员；confirm 1拒绝 2同意
typedef void (*onQueryOwnGroup)(unsigned int matchKey, int reason, int count,ECGroupSimpleInfo *group);//查询我的群组。matchKey 匹配主调键值；reason：200成功，其他报错；
typedef void (*onQueryGroupDetail)(unsigned int matchKey, int reason, ECGroupDetailInfo *detail);//查询群组详情。matchKey 匹配主调键值；reason：200成功，其他报错；
typedef void (*onModifyGroup)(unsigned int matchKey, int reason,ECModifyGroupInfo *pInfo);//修改群组信息。matchKey 匹配主调键值；reason：200成功，其他报错；
typedef void (*onSearchPublicGroup)(unsigned int matchKey, int reason, int searchType,const char* keyword,int count,ECGroupSearchInfo *group);//搜索公共群组。matchKey 匹配主调键值；reason：200成功，其他报错；searchType 搜索类型 1根据GroupId，精确搜索 2根据GroupName，模糊搜索； keyword 搜索关键词；count 群组个数
typedef void (*onQueryGroupMember)(unsigned int matchKey, int reason, const char *groupid,int count,ECGroupMember *member);//查询群组成员。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；
typedef void (*onDeleteGroupMember)(unsigned int matchKey, int reason,const char* groupid,const char* member);//删除群组成员。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；member 成员
typedef void (*onQueryGroupMemberCard)(unsigned int matchKey, int reason, ECGroupMemberCard *card);//查询群组成员名片。matchKey 匹配主调键值；reason：200成功，其他报错；
typedef void (*onModifyGroupMemberCard)(unsigned int matchKey, int reason,ECGroupMemberCard* pCard);//修改群组成员名片。matchKey 匹配主调键值；reason：200成功，其他报错；
typedef void (*onForbidMemberSpeakGroup)(unsigned int matchKey, int reason,const char* groupid,const char* member,int isBan);//群组禁言。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；member 成员；isBan 1允许发言 2禁止发言
typedef void (*onForbidMembersSpeakGroup)(unsigned int matchKey, int reason, char* groupid, char** members,int count,int isBan,int allForbid);//群组禁言。matchKey 匹配主调键值；reason：200成功，其他报错；

typedef void (*onSetGroupMessageRule)(unsigned int matchKey, int reason,const char* groupid, bool notice);//设置群组消息规则。matchKey 匹配主调键值；reason：200成功，其他报错；groupid 群组ID；notice 是否通知

typedef void (*onSetGroupMemberRole)(unsigned int matchKey, int reason);//设置群组成员权限

typedef void (*onSetGroupMembersRole)(unsigned int matchKey, int reason,const char* groupId,char** members, int membersCount,int role, const char *errorCodeMsg);//批量设置群组成员权限

typedef void (*onSearchPublicGroupPaging)(unsigned int matchKey, int reason, int searchType,const char* keyword,int count,ECGroupSearchInfo *group,int pageNo);//搜索公共群组。matchKey 匹配主调键值；reason：200成功，其他报错；searchType 搜索类型 1根据GroupId，精确搜索 2根据GroupName，模糊搜索； keyword 搜索关键词；count 群组个数；int pageNo 搜索分页索引

/****************************服务器下发的群组相关通知******************************/
typedef void (*onReceiveGroupNoticeMessage)(const ECGroupNoticeMessage * pMsg);

/****************************音频播放回调接口******************************/
typedef void (*onRecordingTimeOut)(int ms, const char* sessionId);//录音超时。ms 为录音时长，单位毫秒,sessionId 透传会话ID
typedef void (*onFinishedPlaying)(const char* sessionId,int reason);//播放结束,sessionId透传会话ID,reason 200成功.其他失败
typedef void (*onRecordingAmplitude)(double amplitude,const char* sessionId);//返回音量的振幅。录音时振幅范围0-1,sessionId 透传会话ID

typedef void (*onSendMcmMessage)(unsigned int matchKey, int reason,const char *jsonString);//发送消息回调。reason：200成功，其他报错；
typedef void (*onReceiveMcmMessage)(ECMessage *pMsg);//实时消息状态回调
typedef void (*onReceiveMcmCmdMessage)(ECMcmCmdMessage* pMsg);//实时消息状态回调


//回调结构体
typedef struct _MessageCallBackInterface{
	onSendTextMessage pfonSendTextMessage;
	onReceiveMessage pfonReceiveMessage;
	onReceiveOfflineMessage pfonReceiveOfflineMessage;
	onSendMediaFile pfonSendMediaFile;
	onDownloadFileComplete pfonDownloadFileComplete;
	onRateOfProgressAttach pfonRateOfProgressAttach;
	onReceiveFile pfonReceiveFile;
	onOfflineMessageCount pfonOfflineMessageCount;
	onGetOfflineMessage pfonGetOfflineMessage;
	onOfflineMessageComplete pfonOfflineMessageComplete;
	onRecordingTimeOut pfonRecordingTimeOut;
	onFinishedPlaying pfonFinishedPlaying;
	onRecordingAmplitude pfonRecordingAmplitude;
	onDeleteMessage pfonDeleteMessage;
	onReceiveNoVersionMessage pfonReceiveNoVersionMessage;
    onReceiveOpreateNoticeMessage pfonReceiveOperateNoticeMessage;
	onSetTopContact pfonSetTopContact;
	onGetTopContact pfonGetTopContact;
	onWithDrawMessage pfonWithDrawMessage;
	onFriendsNoticeMessage pfonFriendsNoticeMessage;
	onReadMessage pfonReadMessage;

	onUploadVTMFileOrBuf pfonUploadVTMFileOrBuf;
	onReceiveServerUndefineMessage pfonReceiveServerUndefineMessage;

    onSendMcmMessage pfonSendMcmMessage;
    onReceiveMcmMessage pfonReceiveMcmMessage;
    onReceiveMcmCmdMessage pfonReceiveMcmCmdMessage;


	/****************************群组接口对应的回调******************************/
	onCreateGroup pfonCreateGroup;//reason：200成功，其他报错；
	onDismissGroup pfonDismissGroup;
	onQuitGroup pfonQuitGroup;
	onJoinGroup pfonJoinGroup;
	onReplyRequestJoinGroup pfonReplyRequestJoinGroup;
	onInviteJoinGroup pfonInviteJoinGroup;
	onReplyInviteJoinGroup pfonReplyInviteJoinGroup;
	onQueryOwnGroup pfonQueryOwnGroup;
	onQueryGroupDetail pfonQueryGroupDetail;
	onModifyGroup pfonModifyGroup;
	onSearchPublicGroup pfonSearchPublicGroup;
	onQueryGroupMember pfonQueryGroupMember;
	onDeleteGroupMember pfonDeleteGroupMember;
	onQueryGroupMemberCard pfonQueryGroupMemberCard;
	onModifyGroupMemberCard pfonModifyGroupMemberCard;
	onForbidMemberSpeakGroup pfonForbidMemberSpeakGroup;
    onForbidMembersSpeakGroup pfonForbidMembersSpeakGroup;
	onSetGroupMessageRule pfonSetGroupMessageRule;
	onReceiveGroupNoticeMessage pfonReceiveGroupNoticeMessage;
	onSetGroupMemberRole pfonSetGroupMemberRole;
    onSetGroupMembersRole pfonSetGroupMembersRole;
	onSearchPublicGroupPaging pfonSearchPublicGroupPaging;
	_MessageCallBackInterface():pfonSendTextMessage(NULL),pfonReceiveMessage(NULL),pfonReceiveOfflineMessage(NULL),
		pfonSendMediaFile(NULL),pfonDownloadFileComplete(NULL),pfonRateOfProgressAttach(NULL),pfonReceiveFile(NULL),
		pfonOfflineMessageCount(NULL),pfonGetOfflineMessage(NULL),pfonOfflineMessageComplete(NULL),pfonRecordingTimeOut(NULL),
		pfonFinishedPlaying(NULL),pfonRecordingAmplitude(NULL),pfonDeleteMessage(NULL),pfonReceiveNoVersionMessage(NULL),
		pfonReceiveOperateNoticeMessage(NULL),pfonSetTopContact(NULL),pfonGetTopContact(NULL),
		pfonWithDrawMessage(NULL),pfonFriendsNoticeMessage(NULL),pfonReadMessage(NULL),

		pfonUploadVTMFileOrBuf(NULL),
		pfonReceiveServerUndefineMessage(NULL),

		pfonCreateGroup(NULL),pfonDismissGroup(NULL),pfonQuitGroup(NULL),pfonJoinGroup(NULL),pfonReplyRequestJoinGroup(NULL),
		pfonInviteJoinGroup(NULL),pfonReplyInviteJoinGroup(NULL),pfonQueryOwnGroup(NULL),pfonQueryGroupDetail(NULL),pfonModifyGroup(NULL),
		pfonSearchPublicGroup(NULL),pfonQueryGroupMember(NULL),pfonDeleteGroupMember(NULL),pfonQueryGroupMemberCard(NULL),
		pfonModifyGroupMemberCard(NULL),pfonForbidMemberSpeakGroup(NULL),pfonForbidMembersSpeakGroup(NULL),pfonSetGroupMessageRule(NULL),
		pfonReceiveGroupNoticeMessage(NULL),pfonSetGroupMemberRole(NULL),pfonSetGroupMembersRole(NULL),pfonSearchPublicGroupPaging(NULL)

		,pfonSendMcmMessage(NULL),pfonReceiveMcmMessage(NULL),pfonReceiveMcmCmdMessage(NULL)

	{

	}

}ECMessageCallBackInterface;

#pragma pack ()




#endif
