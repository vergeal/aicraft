#ifndef _EC_VOIP_STRUCT_DEFINE_H
#define _EC_VOIP_STRUCT_DEFINE_H

#include "ECStructDef.h"

enum {//呼叫类型
	EC_VOICE_CALL=0,//语音VoIP电话
	EC_VIDEO_CALL=1,//音视频VoIP电话
	EC_VOICE_CALL_LANDING=2,//语音落地电话
	EC_SHARE_CALL=3,//共享VoIP电话
	EC_VOICE_SHARE_CALL=4,//语音和共享VoIP电话
	EC_VIDEO_SHARE_CALL=5,//音视频和共享VoIP电话
	EC_POLYCOM_DOUBLE_CURRENT_CALL=6,//音视频和共享polycom双流VoIP电话,普通带Bfcp视频呼叫+二次协商
	EC_CISCO_DOUBLE_CURRENT_CALL=7,//音视频和共享思科双流VoIP电话，只做来电处理
	EC_POLYCOM_SWITCH_DOUBLE_CURRENT_CALL=8,//音视频和共享polycom双流VoIP电话,普通带Bfcp视频呼叫+共享时发起二次协商
};
typedef enum{
	VEUnknown = -1,
	VECallProceeding,/** 外呼，服务器回100Tring */
	VECallAlerting, /** 外呼对方振铃 */
	VECallFailed,   /** 外呼失败 */
	VECallAnswered, /** 通话，外呼和来电 */
	VECallReleased, /** 释放呼叫请求中 */
    VECallEnd
}ECVoipEventCode;
enum {//摄像头偏转角度
	EC_ROTATE_AUTO,
	EC_ROTATE_0,
	EC_ROTATE_90,
	EC_ROTATE_180,
	EC_ROTATE_270
};
enum//设置音频处理的开关类型
{
    EC_AUDIO_AGC,//自动增益控制
    EC_AUDIO_EC,//回声消除
    EC_AUDIO_NS//噪声抑制
};
/*
AUDIO_NS: 噪声抑制，主要是去掉原始语音中的噪声。
默认是开启的。
下面的模式都可以用，值越大，语音越纯净，噪声越小，可能会导致语音丢失。现在底层默认是开启最大的kNsVeryHighSuppression。
*/
enum NsMode    // type of Noise Suppression
{
    EC_NsUnchanged = 0,   // previously set mode
    EC_NsDefault,         // platform default
    EC_NsConference,      // conferencing default
    EC_NsLowSuppression,  // lowest suppression
    EC_NsModerateSuppression,
    EC_NsHighSuppression,
    EC_NsVeryHighSuppression,     // highest suppression
};
/*
AUDIO_AGC: 自动增益控制，如果语音声音小,会放大声音;如果声音很大,会调低声音。
因为开启后，周围的小声音也会变大，导致杂音，底层默认是关闭的。
如果开启，模式建议值是kAgcAdaptiveDigital。
*/
enum AgcMode                  // type of Automatic Gain Control
{
    EC_AgcUnchanged = 0,        // previously set mode
    EC_AgcDefault,              // platform default
    // adaptive mode for use when analog volume control exists (e.g. for
    // PC softphone)
    EC_AgcAdaptiveAnalog,
    // scaling takes place in the digital domain (e.g. for conference servers
    // and embedded devices)
    EC_AgcAdaptiveDigital,
    // can be used on embedded devices where the capture signal level
    // is predictable
    EC_AgcFixedDigital
};
/*
AUDIO_EC:回声消除。
默认是开启的。如果关闭，可能导致回声。
如果开启，模式建议值是kEcConference。
*/
// EC modes
enum EcMode                  // type of Echo Control
{
    EC_EcUnchanged = 0,          // previously set mode
    EC_EcDefault,                // platform default
    EC_EcConference,             // conferencing default (aggressive AEC)
    EC_EcAec,                    // Acoustic Echo Cancellation
    EC_EcAecm,                   // AEC mobile
};
enum  {//音频编码
    EC_codec_iLBC,
    EC_codec_G729,
    EC_codec_PCMU,
    EC_codec_PCMA,
    EC_codec_H264,
    EC_codec_SILK8K,
    EC_codec_AMR,
	EC_codec_VP8,
	EC_codec_SILK16K,
	EC_codec_OPUS48,
	EC_codec_OPUS16,
	EC_codec_OPUS8,
};

typedef enum {//共享设备类型
	EC_Share_Device_Type_Screen =0,//屏幕共享
	EC_Share_Device_Type_Windows,//窗体共享
} ECShareDeviceType;

enum {//setUserData类型
	EC_USERDATA_FOR_TOKEN = 0,
	EC_USERDATA_FOR_USER_AGENT = 1,
	EC_USERDATA_FOR_INVITE = 2,//发起呼叫
	EC_USERDATA_FOR_200_OK = 3,//应答
};

//对齐与媒体库保持一致，系统默认，否则会出问题
typedef struct _ECMediaStatisticsInfo
{
	unsigned short fractionLost;//上次调用获取统计后这一段时间的丢包率，范围是0~255，255是100%丢失。
	unsigned int cumulativeLost;//开始通话后的所有的丢包总个数
	unsigned int extendedMax;   //开始通话后应该收到的包总个数
	unsigned int jitterSamples; //抖动
	int rttMs;                  //延迟时间，单位是ms
	unsigned int bytesSent;     //开始通话后发送的总字节数
	unsigned int packetsSent;   //开始通话后发送的总RTP包个数
	unsigned int bytesReceived; //开始通话后收到的总字节数
	unsigned int packetsReceived;//开始通话后收到的总RTP包个数

	_ECMediaStatisticsInfo()
	{
		memset(this,0,sizeof(_ECMediaStatisticsInfo));
	}

	_ECMediaStatisticsInfo(const _ECMediaStatisticsInfo& rOther)
	{
		*this = rOther;
	}

	_ECMediaStatisticsInfo& operator=(const _ECMediaStatisticsInfo& rOther);

} ECMediaStatisticsInfo;

typedef struct _ECCameraCapability
{
	int width;//宽
	int height;//高
	int maxfps;//最大帧率
	_ECCameraCapability()
	{
		memset(this,0,sizeof(_ECCameraCapability));
	}
	_ECCameraCapability(const _ECCameraCapability& rOther)
	{
		*this = rOther;
	}

	_ECCameraCapability& operator=(const _ECCameraCapability& rOther);

} ECCameraCapability;

typedef struct _ECCameraInfo
{
	int index;//摄像头索引
	char name[BUF_LEN_256];	//摄像头名称
	char id[BUF_LEN_256];//摄像头ID
	int capabilityCount;//摄像头能力个数
	ECCameraCapability *capability;//摄像头能力首指针

	_ECCameraInfo()
	{
		memset(this,0,sizeof(_ECCameraInfo));
	}

	_ECCameraInfo(const _ECCameraInfo& rOther)
	{
		*this = rOther;
	}

	_ECCameraInfo& operator=(const _ECCameraInfo& rOther);

}  ECCameraInfo ;

typedef struct _ECSpeakerInfo//喇叭
{
	int index;//索引
	char name[BUF_LEN_128];  //utf8 设备名称
	char guid[BUF_LEN_128];	  //utf8 设备号

	_ECSpeakerInfo()
	{
		memset(this,0,sizeof(_ECSpeakerInfo));
	}

	_ECSpeakerInfo(const _ECSpeakerInfo& rOther)
	{
		*this = rOther;
	}

	_ECSpeakerInfo& operator=(const _ECSpeakerInfo& rOther);

}  ECSpeakerInfo ;

typedef struct _ECMicroPhoneInfo//麦克风
{
	int index;//索引
	char name[BUF_LEN_128];   //utf8设备名称
	char guid[BUF_LEN_128];    //utf8设备号

	_ECMicroPhoneInfo()
	{
		memset(this,0,sizeof(_ECMicroPhoneInfo));
	}

	_ECMicroPhoneInfo(const _ECMicroPhoneInfo& rOther)
	{
		*this = rOther;
	}

	_ECMicroPhoneInfo& operator=(const _ECMicroPhoneInfo& rOther);

}  ECMicroPhoneInfo ;

#pragma pack (4)//自定义结构体或者结构体成员拷贝的 一字节对齐
typedef struct _ECShareWindowInfo//共享窗体
{
	long long id;//ID
	// Title of the window in UTF-8 encoding.
	char title[BUF_LEN_512];//标题

	_ECShareWindowInfo()
	{
		memset(this,0,sizeof(_ECShareWindowInfo));
	}

	_ECShareWindowInfo(const _ECShareWindowInfo& rOther)
	{
		*this = rOther;
	}

	_ECShareWindowInfo& operator=(const _ECShareWindowInfo& rOther);

}ECShareWindowInfo;
typedef struct _ECShareDeviceInfo//共享设备
{
	long long id;//ID
	// Title of the window in UTF-8 encoding.
	char title[BUF_LEN_512];//标题
	//共享设备类 0桌面; 1窗体
	int type;

	_ECShareDeviceInfo()
	{
		memset(this,0,sizeof(_ECShareDeviceInfo));
	}

	_ECShareDeviceInfo(const _ECShareDeviceInfo& rOther)
	{
		*this = rOther;
	}

	_ECShareDeviceInfo& operator=(const _ECShareDeviceInfo& rOther);

}ECShareDeviceInfo;

typedef struct _VoIPCall{
	ECVoipEventCode eCode;//事件状态
	int callType;//通话类型enum {//呼叫类型EC_VOICE_CALL=0,//语音VoIP电话EC_VIDEO_CALL,//音视频VoIP电话EC_VOICE_CALL_LANDING,//语音落地电话};
	char callid[BUF_LEN_64];//通话ID
	char caller[BUF_LEN_64];//主叫
	char callee[BUF_LEN_64];//被叫
	_VoIPCall()
	{
		memset(this,0,sizeof(_VoIPCall));
	}
}ECVoIPCallMsg;

typedef struct _VoIPComingInfo{//来电消息
	int callType;//通话类型enum {//呼叫类型EC_VOICE_CALL=0,//语音VoIP电话EC_VIDEO_CALL,//音视频VoIP电话EC_VOICE_CALL_LANDING,//语音落地电话};
	char callid[BUF_LEN_64];//通话ID
	char caller[BUF_LEN_64];//主叫
	char nickname[BUF_LEN_128];//昵称
	char display[BUF_LEN_20];//显号
	_VoIPComingInfo()
	{
		memset(this,0,sizeof(_VoIPComingInfo));
	}
}ECVoIPComingInfo;

typedef struct _CallBackInfo{//双向回呼消息
	char caller[BUF_LEN_64];//主叫
	char called[BUF_LEN_64];//被叫
	char callerDisplay[BUF_LEN_20];//主叫显号
	char calledDisplay[BUF_LEN_20];//被叫显号
	_CallBackInfo()
	{
		memset(this,0,sizeof(_CallBackInfo));	
	}
}ECCallBackInfo;

typedef struct _ECThreePartConfMsg
{
	int var;//消息类型
	char member[BUF_LEN_256];//要拉取的第三方

	_ECThreePartConfMsg()
	{
		memset(this,0,sizeof(_ECThreePartConfMsg));	
	}
}ECThreePartConfMsg;

typedef struct _ECSenderStatsReport
{
	int channelId;//通道id
	char codecName[BUF_LEN_64];//编码名称
	int transmitBitrate;//码率
	int width;//宽
	int height;//高
	int frameRate;//帧率
	int lossPercent;//丢包率，单位%
	int rttMs;//时延，单位毫秒

	_ECSenderStatsReport()
	{
		memset(this,0,sizeof(_ECSenderStatsReport));	
	}
}ECSenderStatsReport;

typedef struct _ECReceiverStatsReport
{
	int channelId;//通道id
	char codecName[BUF_LEN_64];//编码名称
	int transmitBitrate;//码率
	int width;//宽
	int height;//高
	int frameRate;//帧率

	_ECReceiverStatsReport()
	{
		memset(this,0,sizeof(_ECReceiverStatsReport));	
	}
}ECReceiverStatsReport;

typedef struct _ECWaterMark
{
	char fontfile[100];			//(only text)  fontfile absolute path,windows. eg. 'c\\\\:/usr/wryh.ttf'; android '/sdcard/wryh.ttf'
	char fontcolor[10];         //(only text)  font clolor RGB value eg. '00ff00'
	int  fontsize;				//(only text)  font size  eg. 0~100
	char text[100];				//(only text)  text   eg. 'hello watermark'
	int  x;						//(both)  watermark x positon
	int  y;						//(both)  watermark y positon
	char imagepath[1024];		//(only image)  image path  eg. '/usr/test.png'
	char startposition[100];    //(only image)   base positon  eg. 'topleft','bottomleft','bottomright','topright'
	int  flag;					//(both)  '0': image '1': text
} ECWaterMark;

/****************************VOIP回调接口******************************/
typedef void (*onMakeCallBack)(unsigned int matchKey,int reason,ECCallBackInfo *pInfo);//回拨请求。reason：200成功，其他报错；
typedef void (*onCallEvents)(int reason,const ECVoIPCallMsg * call);//事件状态。reason：事件状态返回值；
typedef void (*onCallIncoming)(ECVoIPComingInfo *pComing);  //音视频呼叫接到邀请
typedef void (*onDtmfReceived)(const char *callId, char dtmf);//收到DTMF按键时的回调。callId 通话ID；	
typedef void (*onSwitchCallMediaTypeRequest)(const char*callId,int video); // 收到对方更新媒体请求。 callId 通话ID；video：1  请求增加视频（需要响应） 0:请求删除视频（可以不响应，底层自动去除视频）
typedef void (*onSwitchCallMediaTypeResponse)(const char*callId,int video);  // 对方应答媒体状态结果。callId 通话ID； video 1 有视频 0 无视频
typedef void (*onRemoteVideoRatio)(const char *CallidOrConferenceId, int width, int height, int type, const char *member);//远端视频媒体分辨率变化时上报。type : 0 点对点,1 视频会议，2 共享会议；type=0 CallidOrConferenceId为通话id，type>0 CallidOrConferenceId为会议id；member成员
typedef void (*onNoCamera)(const char *callid);//无摄像头
typedef void (*onNoMicRecording)(const char *callid,int reason);//无麦克采集,没插麦克风报错

typedef void (*onFloorEventNotify)(const char* callid, int callType, int eventType);//callType： 呼叫类型，比如思科还是ployom; confId：   会议Id; 通知事件类型, 目前只有两种，共享打开1，共享关闭0
typedef void (*onFloorStatusNotify)(const char *callid,int reason);//polycom双流状态通知,reason:PENDING 901;ACCEPTED 902;GRANTED 903;DENIED 904;CANCELLED 905;RELEASED	906;REVOKED	907;TIMEOUT	908
typedef void (*onInviteJoinThreePartConf)(unsigned int matchKey, int reason, const char* jsonString);//邀请加入三方通话回调。matchKey 匹配主调键值；200成功， 其他报错；
typedef void (*onReceiveThreePartConfNotification)(ECThreePartConfMsg* , const char *jsonString);//邀请加入三方通话通知回调。var消息类型 参考枚举值 SipMsgCmdVarInner目前三方通话只有601,602 
typedef void (*onRequestThreeConfMemberVideo)(int reason, const char* confId, const char* member, int type, const char* jsonString);//请求三方通话成员视频
typedef void (*onCancelThreeConfMemberVideo)(int reason, const char* confId, const char* member, int type, const char* jsonString);//取消三方通话成员视频
typedef void (*onCallPaused)(const char* callid,int type,int reason, const char* jsonString);//通话保持。type，0 本端发起，1对端发起；reason：200成功，其他报错；
typedef void (*onCallResumed)(const char* callid,int type,int reason, const char* jsonString);//恢复暂停的通话。type，0 本端发起，1对端发起；reason：200成功，其他报错；

typedef void (*onAudioData)(const char *callid, const void *inData, int inLen, void *outData, int *outLen, bool send); //在音频数据发送之前，将音频数据返回给上层处理，然后将上层处理后的数据返回来。inData，传出数据，inLen传出数据长度；outData, 处理后的数据，outLen 处理后数据长度,send 上下行
typedef void (*onVideoData)(const char *callid, const void *inData, int inLen, void *outData, int *outLen, bool send); //在视频数据发送之前，将视频数据返回给上层处理，然后将上层处理后的数据返回来。inData，传出数据，inLen传出数据长度；outData, 处理后的数据，outLen 处理后数据长度,send 上下行
typedef void (*onAudioCaptureData)(const char *callid, unsigned char* data, int length, int samples, int sampleRate, int numChannels);//原始PCM音频数据。data: 原始PCM音频数据，16位小端格式;length:长度;sample: 采样个数;sampleRate:采样率;numChannels:声道个数
typedef void (*onVideoCaptureData)(const char *callid, unsigned char* data, int length, int width, int height, int y_stride, int uv_stride);//原始I420格式视频数据。data: 标准一帧 i420 视频数据;length:长度;with:视频宽;height: 视频高;y_stride: y步长;uv_stride: u,v步长;
typedef void (*onShareWindowSizeChange)(const char *callid, const char *conferenceId,int width, int height,float* sendCodecScale);//本地共享窗体大小变化,sendCodecScale （可选）设置发送编码缩放比,由上层用户设置
typedef void (*onShareDesktopCaptureErrCode)(const char *callid, const char *conferenceId, int errCode);//本地共享错误码上报
typedef void (*onAudioEnergyFeedback)(int averageEnergy); // 麦克风测试回调. averageEnergy 本地音频量级反馈值范围0~16.

typedef void (*onMultiTerminalRemoteVideoRatio)(const char *CallidOrConferenceId, int width, int height, int type, const char *member, int deviceType);//多终端时远端视频媒体分辨率变化时上报。type : 0 点对点,1 视频会议，2 共享会议；type=0 CallidOrConferenceId为通话id，type>0 CallidOrConferenceId为会议id；member成员
																																					   
//点对点录制接口回调
typedef void(*onStartRecordP2P)(unsigned int matchKey, const char* callid, int reason, const char* jsonString);
typedef void(*onStopRecordP2P)(unsigned int matchKey, const char* callid, int reason, const char* jsonString);
typedef void(*onRecordP2pSwitchMember)(unsigned int matchKey, const char* callid, int reason, const char* jsonString);
typedef void(*onRecordP2pGetFileList)(unsigned int matchKey, const char* callid, int reason, const char* jsonString);
typedef void(*onRecordP2pDelete)(unsigned int matchKey, const char* callid, int reason, const char* jsonString);

//回调结构体
typedef struct _VoipCallBackInterface{
	onCallEvents pfnonCallEvents;
	onMakeCallBack pfonMakeCallBack;
	onCallIncoming pfonCallIncoming;
	onDtmfReceived pfonDtmfReceived;
	onSwitchCallMediaTypeRequest pfonSwitchCallMediaTypeRequest; 
	onSwitchCallMediaTypeResponse pfonSwitchCallMediaTypeResponse; 
	onRemoteVideoRatio pfonRemoteVideoRatio;
	onNoCamera pfonNoCamera;
	onNoMicRecording pfonNoMicRecording;

	onFloorEventNotify pfonFloorEventNotify;
	onFloorStatusNotify pfonFloorStatusNotify;
	onInviteJoinThreePartConf pfonInviteJoinThreePartConf;
	onReceiveThreePartConfNotification pfonReceiveThreePartConfNotification;
	onRequestThreeConfMemberVideo pfonRequestThreeConfMemberVideo;
	onCancelThreeConfMemberVideo pfonCancelThreeConfMemberVideo;
	onCallPaused pfonCallPaused;
	onCallResumed pfonCallResumed;
	onAudioData pfonAudioData;
	onVideoData pfonVideoData;
	onAudioCaptureData pfonAudioCaptureData;
	onVideoCaptureData pfonVideoCaptureData;
	onShareWindowSizeChange pfonShareWindowSizeChange;
	onShareDesktopCaptureErrCode pfonShareDesktopCaptureErrCode;
	onAudioEnergyFeedback pfonAudioEnergyFeedback;
	onMultiTerminalRemoteVideoRatio pfonMultiTerminalRemoteVideoRatio;
	onStartRecordP2P pfonStartRecordP2P;
	onStopRecordP2P pfonStopRecordP2P;
	onRecordP2pSwitchMember pfonRecordP2pSwitchMember;
	onRecordP2pGetFileList pfonRecordP2pGetFileList;
	onRecordP2pDelete pfonRecordP2pDelete;

	_VoipCallBackInterface():pfnonCallEvents(NULL),pfonMakeCallBack(NULL),pfonCallIncoming(NULL),pfonDtmfReceived(NULL),
		pfonSwitchCallMediaTypeRequest(NULL),pfonSwitchCallMediaTypeResponse(NULL),pfonRemoteVideoRatio(NULL),
		pfonNoCamera(NULL),pfonNoMicRecording(NULL),

		pfonFloorEventNotify(NULL),pfonFloorStatusNotify(NULL),
		pfonInviteJoinThreePartConf(NULL),pfonReceiveThreePartConfNotification(NULL),
		pfonRequestThreeConfMemberVideo(NULL),pfonCancelThreeConfMemberVideo(NULL),
		pfonCallPaused(NULL),pfonCallResumed(NULL),pfonAudioData(NULL),pfonVideoData(NULL),
		pfonAudioCaptureData(NULL),pfonVideoCaptureData(NULL),pfonShareWindowSizeChange(NULL),
		pfonShareDesktopCaptureErrCode(NULL), pfonAudioEnergyFeedback(NULL),pfonMultiTerminalRemoteVideoRatio(NULL),
		pfonStartRecordP2P(NULL), pfonStopRecordP2P(NULL), pfonRecordP2pSwitchMember(NULL),
		pfonRecordP2pGetFileList(NULL), pfonRecordP2pDelete(NULL)
	{

	}
}ECVoipCallBackInterface;

//化整为零
typedef void(*onVideoRemoteData)(const char *callid, unsigned char* data, int length, int width, int height, int y_stride, int uv_stride);//原始I420格式视频数据。data: 标准一帧 i420 视频数据;length:长度;with:视频宽;height: 视频高;y_stride: y步长;uv_stride: u,v步长;

#pragma pack ()

#endif