#ifndef _EC_VOIP_INTERFACE_H
#define _EC_VOIP_INTERFACE_H

#include "ECVoipStructDef.h"
#ifdef __cplusplus
extern "C" 
{
#endif
//////////////////////////////////////////////////回调函数接口///////////////////////////////////////////////////////////
	//回调设置接口，必须在主调前调用
	EC_CALL_API void SetVoIPCallBackFuction(ECVoipCallBackInterface *VoipInterface);

//////////////////////////////////////////////////主调函数接口///////////////////////////////////////////////////////////
	    /*! @function
     ********************************************************************************
     函数名   : MakeCallBack
     功能     : 回拨
	 参数     : [OUT] matchKey      : SDK内部生成，开发者匹配请求和结果回调，不关心可以传入null
				[IN]  caller		: 主叫方号码。根据呼叫类型不同，格式也不同
				[IN]  called		: 被叫方号码。根据呼叫类型不同，格式也不同
				[IN]  callerDisplay	: 主叫方名称。
				[IN]  calledDisplay	: 被叫方名称。   
     返回值   : 是否成功 0：成功； 非0失败
     回调函数 ：(*onMakeCallBack)
     *******************************************************************************/
    EC_CALL_API int MakeCallBack(unsigned int *matchKey,const char *caller, const char *called, const char *callerDisplay,const char *calledDisplay);
    
	/*! @function
	********************************************************************************
	函数名   : MakeCall
	功能     : 发起呼叫		
	参数     : 	[out]OutCallid    : 此路呼叫的callid
				[IN]  callType	  : 呼叫类型enum {VOICE_CALL,//语音VoIP电话  VIDEO_CALL,//视频VoIP电话   VOICE_CALL_LANDING//语音落地电话};
				[IN]  called	  : 被叫方号码。
				[IN]  toThird     : 第三方对接字冠。
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：void (*onCallEvents)
	*******************************************************************************/
	EC_CALL_API int MakeCall(const char **OutCallid,int callType, const char *called);
	EC_CALL_API int MakeCallEx(const char **OutCallid, int callType, const char *called, const char* toThird);
	/*! @function
	********************************************************************************
	函数名   : AcceptCall
	功能     : 应答呼入。可以选择媒体类型
	参数     : [IN]  callId	  : 当前呼叫的唯一标识
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：void (*onCallEvents)
	*******************************************************************************/
	EC_CALL_API int AcceptCall(const char *callId);

	/*! @function
	********************************************************************************
	函数名   : ReleaseCall
	功能     : 挂机。二十秒没有语音流，SDK自动挂机
	参数     : [IN]  callId	  : 当前呼叫的唯一标识。
	参数     ：[IN]  reason   ：挂机原因。正常挂机0，取消呼叫0，拒接175603，被叫忙175486
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：void (*onCallEvents)
	*******************************************************************************/
	EC_CALL_API int ReleaseCall(const char *callId, int reason);

	/*! @function
	********************************************************************************
	函数名   : SetSipCallTimeout
	功能     : 设置未收到对方呼叫信令的超时时间，响铃和应答超时一样，如果不设置或者(secondTime < 10 || secondTime > 120)sdk按照底层默认
	参数     : [IN]  secondTime: 单位秒。底层默认20秒
	返回值   : 无
	***************************************************************************/
	EC_CALL_API  void SetSipCallTimeout(int secondTime);

	/*! @function
	********************************************************************************
	函数名   : SetMediaPacketTimeout
	功能     : 媒体超时时间
	参数     : [IN]  secondTime: 单位秒。底层默认20秒
	返回值   : 无
	***************************************************************************/
	EC_CALL_API  void SetMediaPacketTimeout(int secondTime);
	
	/*! @function
	********************************************************************************
	函数名   : SendDTMF
	功能     : 发送按键信息
	参数     : [IN]  callId	  : 当前呼叫的唯一标识.
			   [IN]	 dtmf	  : 一个按键值
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：void (*onDtmfReceived)
	*******************************************************************************/
	EC_CALL_API int SendDTMF(const char *callId, const char dtmf);

	/*! @function
	********************************************************************************
	函数名   : SetUserCustomData
	功能     : 增加自定义
	参数     : [IN] type : 根据什么类型添加userdata
	enum {
	USERDATA_FOR_TOKEN = 0,
	USERDATA_FOR_USER_AGENT = 1,
	USERDATA_FOR_INVITE = 2,//发起呼叫
	USERDATA_FOR_200_OK = 3,//应答
	};
	[IN]	data : userdata内容，比如 key=value;key1=value1 用户自定义userdata，每次覆盖上一次data内容
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API void SetUserCustomData(int type, const char *data);

	/*! @function
	********************************************************************************
	函数名   : AppendUserData
	功能     : 增加自定义
	参数     : [IN] type : 根据什么类型追加userdata
					enum {
						USERDATA_FOR_TOKEN = 0,
						USERDATA_FOR_USER_AGENT = 1,
						USERDATA_FOR_INVITE = 2,//发起呼叫
						USERDATA_FOR_200_OK = 3,//应答
					};
			   [IN]	data : userdata内容，比如 key=value;key1=value1，每次都会追加userdata
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：无
	*******************************************************************************/
	EC_CALL_API int AppendUserData(int type, const char *data);

	/*! @function
	********************************************************************************
	函数名   : GetCurrentCall
	功能     : 获取当前通话的callId 
	参数     : 
	返回值   : 成功为 callId ，失败为NULL
	*******************************************************************************/
	EC_CALL_API const char* GetCurrentCall();

	/*! @function
	********************************************************************************
	函数名   : SetMute
	功能     : 通话过程中设置麦克风设备静音，自己能听到对方的声音，通话对方听不到自己的声音。
	参数     : [IN]  mute : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int SetMute(bool mute);

	/*! @function
	********************************************************************************
	函数名   : GetMuteStatus
	功能     : 获取麦克风设备静音状态
	参数     : 无
	返回值   :  true 开启； false关闭
	*******************************************************************************/
	EC_CALL_API bool GetMuteStatus();

	/*! @function
	********************************************************************************
	函数名   : SetRemoteMute
	功能     : 通话过程中设置远端静音.(自己不听对方声音)
	参数     : [IN]  callid	: 当前呼叫的唯一标识
			   [IN]  on     : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int SetRemoteMute(const char *callid, bool on);

	/*! @function
	********************************************************************************
	函数名   : SetSoftMute
	功能     : 通话过程中设置软静音，自己能听到对方的声音，通话对方听不到自己的声音。
	参数     : [IN]  callid	: 当前呼叫的唯一标识
			   [IN]  on     : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int SetSoftMute(const char *callid,bool on);

	/*! @function
	********************************************************************************
	函数名   : GetSoftMuteStatus
	功能     : 获取软静音状态
	参数     : [IN]  callid	: 当前呼叫的唯一标识
			   [IN]  bMute  : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int GetSoftMuteStatus(const char *callid,bool* bMute);

	/*! @function
	********************************************************************************
	函数名   : SetSoftSpeak
	功能     : 设置应用播放器开关。开启，播放本应用对方声音；关闭，不能播放本应用对方声音，其他应用声音无影响。
	参数     : [IN]  callid	: 当前呼叫的唯一标识.当callid为空时，为全局设置
	[IN]  on     : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int SetSoftSpeak(const char *callid, bool on);

    /*! @function
    ********************************************************************************
     函数名   : SetAudioConfigEnabled
     功能     : 设置音频处理的开关
     参数     : [IN] type : 音频处理类型.  AUDIO_AGC(音频增益), AUDIO_EC(回声消除), AUDIO_NS(噪音抑制)
                [IN] enabled:  AGC默认关闭; EC和NS默认开启.
                [IN] mode: 各自对应的模式中的枚举值: AgcMode、EcMode、NsMode.
     返回值   :  是否成功 0：成功； 非0失败
    *****************************************************************************/
    EC_CALL_API int SetAudioConfigEnabled(int type, bool enabled, int mode);

	/*! @function
	********************************************************************************
	函数名   : SetAudiolevelStatus
	功能     : 设置音频处理的开关
	参数     : [IN] sendStatus : 设置发送端rtp拓展头audio level开启状态
			   [IN] recvStatus : 设置接受端rtp拓展头audio level开启状态
	返回值   :  是否成功 0：成功； 非0失败
	*****************************************************************************/
	EC_CALL_API int SetAudiolevelStatus(bool sendStatus, bool recvStatus);

	/*! @function
    ********************************************************************************
     函数名   : GetAudioConfigEnabled
     功能     : 获得音频处理的开关状态
     参数     :  [IN] type : 音频处理类型. AUDIO_AGC(音频增益), AUDIO_EC(回声消除), AUDIO_NS(噪音抑制)
                 [OUT] enabled:  AGC默认关闭; EC和NS默认开启.
                 [OUT] mode: 各自对应的模式中的枚举值: AgcMode、EcMode、NsMode.
     返回值   :  是否成功 0：成功； 非0失败
    *****************************************************************************/
    EC_CALL_API int GetAudioConfigEnabled(int type, bool *enabled, int *mode);

	 /*! @function
     ********************************************************************************
     函数名   : GetCodecEnabled
     功能     : 设置支持的编解码方式，默认全部都支持
     参数     : [IN]  type : 编解码类型.
						enum  {
							codec_iLBC,
							codec_G729,
							codec_PCMU,
							codec_PCMA,
							codec_H264,
							codec_SILK8K,
							codec_AMR,
							codec_VP8,
							codec_SILK16K,
							codec_OPUS48 = 9,
							codec_OPUS16 = 10,
							codec_OPUS8 = 11,
						};
                [IN] enabled: 0 不支持；1 支持
     返回值   :  是否成功 0：成功； 非0失败
     *******************************************************************************/
	EC_CALL_API int SetCodecEnabled(int type,bool enabled);

	 /*! @function
     ********************************************************************************
     函数名   : GetCodecEnabled
     功能     : 获得编解码方式是否被支持
     参数     : [IN]  type : 编解码类型.
                     codec_iLBC,
                     codec_G729,
                     codec_PCMU,
                     codec_PCMA,
                     codec_H264,
                     codec_SILK8K,
					 codec_AMR,
					 codec_VP8,
					 codec_SILK16K,
					 codec_OPUS48 = 9,
					 codec_OPUS16 = 10,
					 codec_OPUS8 = 11,
     返回值   :  true 支持；false不支持
     *******************************************************************************/
	bool EC_CALL_API GetCodecEnabled(int type);

	/*! @function
     ********************************************************************************
     函数名   : SetCodecNack
     功能     : 设置媒体流重传。打开后通话质量变好，但是延迟可能增加
     参数     : [IN] bAudioNack:音频开关,底层默认true
                [IN] bVideoNack:视频开关,底层默认true
     返回值   :  是否成功 0：成功； 非0失败
     *******************************************************************************/
	EC_CALL_API int SetCodecNack(bool bAudioNack,bool bVideoNack);

	 /*! @function
     ********************************************************************************
	 函数名   : GetCodecNack
     功能     : 获得媒体流重传当前设置值。
     参数     : [OUT] bAudioNack:音频开关
                [OUT] bVideoNack:视频开关
     返回值   :  是否成功 0：成功； 非0失败
     *******************************************************************************/
	EC_CALL_API int GetCodecNack(bool *bAudioNack,bool *bVideoNack);

	/*! @function
	********************************************************************************
	函数名   : SetCodecRed
	功能     : 设置媒体流冗余。打开后通话减少丢包率，但是会增加流量
	参数     : [IN] bAudioRed:音频开关,底层默认2。0关闭，1协商打开,2只有会议才协商
	返回值   :  是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API  int SetCodecRed(int bAudioRed);

	 /*! @function
     ********************************************************************************
     函数名   : setRequestKeyFrameMode
     功能     : 设置视频发关键帧模式。
     参数     : [IN] mode:模式。默认0 底层媒体库RTCP；1 INFO模式
     返回值   :  是否成功 0：成功； 非0失败
     *******************************************************************************/
	EC_CALL_API  int SetRequestKeyFrameMode(int mode);

	 /*! @function
     ********************************************************************************
     函数名   : GetCallStatistics
     功能     : 获取通话中的统计数据
     参数     : [IN] callId     : 当前呼叫的唯一标识.
			  : [IN] bVideo     : true 统计视频通话数据，false 统计音频通话数据
                [OUT] statistics:  CallStatisticsInfo结构的统计数据
     返回值   :  是否成功 0：成功； 非0失败
     *****************************************************************************/
	EC_CALL_API int GetCallStatistics(const char *callId, bool bVideo,ECMediaStatisticsInfo *statistics);

 	 /*! @function
     ********************************************************************************
     函数名   :  SetVideoView
	 功能     :  设置视频通话显示。呼叫前和应答前调用
	 参数     :  [IN] view      : 对方显示视图
				 [IN] localView : 本地显示视图
     返回值   :  0 成功； 非0失败 
     *********************************************************************************/
	EC_CALL_API int SetVideoView( void *view, void *localView);

 	 /*! @function
     ********************************************************************************
     函数名   :  SetVideoViewEX
	 功能     :  设置视频通话显示。呼叫前和应答前调用
	 参数     :  [IN] view             : 对方显示视图
				 [IN] localView        : 本地显示视图
				 [IN] remoteShareView  : 对方显示视图，双流通话有效。
				 [IN] localShareView   : 本地显示视图，双流通话有效。
     返回值   :  0 成功； 非0失败 
     *********************************************************************************/
	EC_CALL_API int SetVideoViewEX( void *view, void *localView, void *remoteShareView, void *localShareView);
	
	 /*! @function
     ********************************************************************************
     函数名   : SetVideoBitRates
     功能     : 设置视频压缩的码流。如果调用，需要在建立视频通话前 
     参数     :  [IN] bitrates :  视频码流，单位kb/s
	 返回值   :  无
     ***************************************************************************/
    EC_CALL_API void SetVideoBitRates(int bitrates);

	 /*! @function
     ********************************************************************************
     函数名   : SetRing
	 功能     : 设置本地振铃。当来电时，本地播放振铃音。默认为播放.\\ring.wav
	 参数     : [IN] fileName : 声音文件，格式为.wav,采样率16000HZ,16bit,单声道。
     返回值   : 是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int SetRing(const char* fileName);

	 /*! @function
     ********************************************************************************
     函数名   : SetRingback
	 功能     : 设置本地回铃音。当外呼VoIP时，本地播放回铃音。默认为播放.\\ringback.wav
	 参数     : [IN] fileName : 声音文件，格式为.wav.wav,采样率16000HZ,16bit,单声道。
     返回值   : 是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int SetRingback(const char*fileName);

	 /*! @function
     ********************************************************************************
     函数名   : RequestSwitchCallMediaType
     功能     : 更新通话中媒体类型。voice <->video,注意：该接口只能在视频通话时才能调用。也就是说在一开始创建
				的是视频通话，后可以调用该函数转换成音频通话，此时的音频通话还可以调用该函数来切换到视频通话，
				如果一开始创建的就是音频通话则不可以调用该函数来切换视频通话。另外当从视频切换到音频是不需要对方
				同意即可转换，但从音频切换到视频时必须要对方调用CCPresponseSwitchCallMediaType接口，并把video置为
				1才可以，否则转换不成功。
     参数     : [IN]  callId   : 当前呼叫的唯一标识.
                [IN]  video    : 1 添加视频； 0 去除视频
     返回值   : 是否成功 0：成功； 非0失败
	 回调函数 ：对方 void (*onSwitchCallMediaTypeRequest)
	            本地 void (*onSwitchCallMediaTypeResponse) 
     *******************************************************************************/
     EC_CALL_API int RequestSwitchCallMediaType(const char *callId, int video);
    
    /*! @function
     ********************************************************************************
     函数名   : ResponseSwitchCallMediaType
     功能     : 回复对方的更新通话中媒体类型请求。当音频恢复视频请求时调用，删除视频请求时无效
     参数     : [IN]  callId   : 当前呼叫的唯一标识.
                [IN]  video    : 1 添加视频； 0 去除视频
     返回值   : 是否成功 0：成功； 非0失败
     *******************************************************************************/
     EC_CALL_API int ResponseSwitchCallMediaType(const char *callId, int video);
	 
	 /*! @function
     ********************************************************************************
     函数名   : GetCameraInfo
     功能     : 查询摄像头信息。
     参数     : [IN] info :  摄像头信息CameraInfo
     返回值   : 摄像头个数
     *********************************************************************************/
	EC_CALL_API int GetCameraInfo(ECCameraInfo **  info);

	/*! @function
	********************************************************************************
	函数名   : GetCameraInfoEx
	功能     : 查询摄像头信息
	参数     : [IN] info :  摄像头信息CameraInfo
	注意	 : 每次调用重新生成摄像头资源内存，需要用户自己释放其内存
	返回值   : 摄像头个数
	*********************************************************************************/
	EC_CALL_API int GetCameraInfoEx(ECCameraInfo **  info);
	EC_CALL_API int FreeCameraInfoEx(ECCameraInfo **  info);

	 /*! @function
     ********************************************************************************
     函数名   : SelectCamera
     功能     : 选择摄像头。可以在通话过程中选择；如果不调用，底层将使用系统默认摄像头
     参数     :  [IN] cameraIndex     : CameraInfo的index值。从CCPgetCameraInfo获取
				 [IN] capabilityIndex : CameraCapability的index值。范围[0,capabilityCount-1]
				 [IN] fps             : 最大帧数       
				 [IN] rotate          : 旋转的角度（enum {ROTATE_AUTO,ROTATE_0,ROTATE_90,ROTATE_180,ROTATE_270};中的值）
				 [IN] force           : 是否强制启动本SDK调用的摄像头。默认选false
     返回值   :  是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int SelectCamera(int cameraIndex, int capabilityIndex,int fps,int rotate,bool force);

	 /*! @function
     ********************************************************************************
     函数名   : SelectCameraScale
     功能     : 选择摄像头。可以在通话过程中选择；如果不调用，底层将使用系统默认摄像头
     参数     :  [IN] cameraIndex     : CameraInfo的index值。从CCPgetCameraInfo获取
				 [IN] capabilityIndex : CameraCapability的index值。范围[0,capabilityCount-1]
				 [IN] fps             : 最大帧数       
				 [IN] rotate          : 旋转的角度（enum {ROTATE_AUTO,ROTATE_0,ROTATE_90,ROTATE_180,ROTATE_270};中的值）
				 [IN] force           : 是否强制启动本SDK调用的摄像头。默认选false
				 [IN] scale           : 编码缩放，正实数。默认1.0，小于1.0缩小，大于1.0放大
     返回值   :  是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int SelectCameraScale(int cameraIndex, int capabilityIndex,int fps,int rotate,bool force,float scale);

	 /*! @function
	 ********************************************************************************
	 函数名   : setCaptureSourc
	 功能     : 设置视频采集源。
	 参数     :  [IN] mode     : 模式。0 摄像头，1 文件
	 [IN] fileUTF8 : 图片文件。mode为1时有效.只支持.bmp或者 .jpg
	 返回值   :  是否成功 0：成功； 非0失败
	 *********************************************************************************/
	 EC_CALL_API int SetCaptureSource(int mode, const char *fileUTF8);

	 /*! @function
	 ********************************************************************************
	 函数名   : startCameraPreview
	 功能     : 打开摄像头预览
	 参数     :  [IN] cameraIndex     : CameraInfo的index值。从CCPgetCameraInfo获取
	 [IN] videoW : 预览窗口宽
	 [IN] videoH : 预览窗口高
	 [IN] rotate : 旋转的角度（enum {ROTATE_AUTO,ROTATE_0,ROTATE_90,ROTATE_180,ROTATE_270};中的值）
	 [IN] videoWnd  : 窗口句柄
	 返回值   :  是否成功 0：成功； 非0失败
	 *********************************************************************************/
	 EC_CALL_API int StartCameraPreview(int cameraIndex, int videoW, int videoH, int rotate, void *videoWnd);

	 /*! @function
	 ********************************************************************************
	 函数名   : StopCameraPreview
	 功能     : 关闭摄像头预览
	 参数     : 无
	 返回值   :  是否成功 0：成功； 非0失败
	 *********************************************************************************/
	 EC_CALL_API int StopCameraPreview();

	  /*! @function
     ********************************************************************************
     函数名   : GetSpeakerInfo
     功能     : 查询扬声器信息。
     参数     : [IN] info：扬声器信息ECSpeakerInfo
     返回值   : 扬声器个数。
     ***************************************************************************/
     EC_CALL_API int GetSpeakerInfo(ECSpeakerInfo **info);

	 /*! @function
     ********************************************************************************
     函数名   : SelectSpeaker
     功能     : 选择扬声器。可以在通话过程中选择；如果不调用，SDK使用系统默认扬声器
     参数     : [IN] speakerIndex : SpeakerInfo的index值，从GetSpeakerInfo获取
     返回值   : 是否成功 0：成功； 非0失败
     *********************************************************************************/
     EC_CALL_API int SelectSpeaker(int speakerIndex);

	 /*! @function
     ********************************************************************************
     函数名   : TestSpeakerStart
     功能     : 扬声器测试。调用之前，需要调用SelectSpeaker选择驱动
	 参数     : [IN] filename : 音频文件。wav
				[IN] interval : 保留
				[IN] ringmode : 默认取0
     返回值   : 是否成功 0：成功； 非0失败
	 *********************************************************************************/
	 EC_CALL_API int TestSpeakerStart(const char *filename, int interval, int ringmode);

	 /*! @function
     ********************************************************************************
     函数名   : TestSpeakerStop
     功能     : 扬声器测试关闭。
				[IN] ringmode : 默认取0
     返回值   : 是否成功 0：成功； 非0失败
	 *********************************************************************************/
	 EC_CALL_API int TestSpeakerStop(int ringmode);

	 /*! @function
     ********************************************************************************
     函数名   : GetMicroPhoneInfo
     功能     : 查询麦克风信息。
     参数     : [IN] info :  麦克风信息ECMicrophoneinfo
     返回值   : 麦克风个数。
     *********************************************************************************/
     EC_CALL_API int GetMicroPhoneInfo(ECMicroPhoneInfo** info);

	 /*! @function
     ********************************************************************************
     函数名   : SelectMicroPhone
	 功能     : 选择麦克风。可以在通话过程中选择；如果不调用，SDK使用系统默认麦克风
	 参数     : [IN] microphoneIndex : MicroPhoneInfo的index值，从getMicroPhoneInfo获取
     返回值   : 是否成功 0：成功； 非0失败
     *********************************************************************************/
     EC_CALL_API int SelectMicroPhone(int microphoneIndex);	

	 /*! @function
     ********************************************************************************
     函数名   : TestMicroPhone
	 功能     : 测试麦克风。注:调用此函数之前先调用SelectMicroPhone
     返回值   : 是否成功 0：成功； 非0失败
     *********************************************************************************/
     EC_CALL_API int TestMicroPhone();	

	 /*! @function
     ********************************************************************************
     函数名   : TestMicroPhoneStop
	 功能     : 关闭麦克风测试。注:如果不关闭再次调用测试麦克风会失败
     返回值   : 是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int TestMicroPhoneStop();

     /*! @function ************************************************************************ 
	 函数名 : GetNetworkStatistic
	 功能 : 获取通话的网络流量信息
	 参数 : [IN]  callId       : 当前呼叫的唯一标识。会议时，输入会议id
	        [OUT] duration     ：媒体交互的持续时间，单位秒，可能为0。不能作为计费结算时长，只是媒体流的统计累积时长；存储8字节
	        [OUT] sendTotalWifi：在duration时间内，网络发送的总流量，单位字节。存储8字节
	        [OUT] recvTotalWifi：在duration时间内，网络接收的总流量，单位字节。存储8字节
	 返回值 : 是否成功 0：成功； 非0失败
	***********************************************************************/
	EC_CALL_API int GetNetworkStatistic(const char *callId, long long *duration,long long *sendTotalWifi, long long *recvTotalWifi);

	    /*! @function
    ********************************************************************************
     函数名   : GetSpeakerVolume
     参数    : [OUT] volume ：范围：【0~255】
     返回值   : 是否成功 0：成功； 非0失败
    *******************************************************************************/
	EC_CALL_API  int GetSpeakerVolume(unsigned int* volume);

	/*! @function
    ********************************************************************************
     函数名   : SetSpeakerVolume
     功能     : 设置扬声器音量的默认值
     参数     : [IN] volume ：范围：【0~255】
     返回值   : 是否成功 0：成功； 非0失败
    *******************************************************************************/
	EC_CALL_API  int SetSpeakerVolume(unsigned int volume);

	/*! @function
    ********************************************************************************
     函数名   : SetDtxEnabled
     功能     : 舒适噪音开关，默认是关闭。关闭后没有舒适噪音，减少带宽。 
     参数     : [IN]  enabled :   true 打开; false 关闭    
     返回值   : 无 
	***************************************************************************/
   EC_CALL_API void SetDtxEnabled(bool enabled);
  
   /*! @function
	********************************************************************************
	函数名   : SetSelfPhoneNumber
	功能     : 设置用户虚拟数据 电话号码
	参数     : [IN]  phoneNumber : 电话号码
	返回值   : 无
	*******************************************************************************/
	EC_CALL_API void SetSelfPhoneNumber(const char * phoneNumber);

	/*! @function
	********************************************************************************
	函数名   : SetSelfName
	功能     : 设置用户虚拟数据 昵称
	参数     : [IN]  nickName : 昵称
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API void SetSelfName(const char * nickName);
    
	/*! @function
	********************************************************************************
	函数名   : EnableLoudsSpeaker
	功能     : 设置扬声器状态,
	参数     : [IN]  enable : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int EnableLoudsSpeaker(bool enable);

	/*! @function
	********************************************************************************
	函数名   : GetLoudsSpeakerStatus
	功能     : 获取当前扬声器否开启状态
	参数     : 
	返回值   : true 开启； false关闭
	*******************************************************************************/
	EC_CALL_API bool GetLoudsSpeakerStatus();

	/*! @function
	********************************************************************************
	函数名   : SetLocalCamera
	功能     : 通话过程中设置本端摄像头开启关闭，自己能看到对方，通话对方看不到自己。
	参数     : [IN]  callid	: 当前呼叫的唯一标识
			   [IN]  on     : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int SetLocalCamera(const char *callid,bool on);

	/*! @function
	********************************************************************************
	函数名   : SetLocalShareDevice
	功能     : 通话过程中设置本端数据共享开启关闭，通话对方看不到自己。
	参数     : [IN]  callid	: 当前呼叫的唯一标识.当callid为空时为全局设置
			   [IN]  on     : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：void (*onFloorStatusNotify)(const char *callid,int reason);//polycom双流状态通知
	*******************************************************************************/
	EC_CALL_API int SetLocalShareDevice(const char *callid,bool on);

    /*! @function
	********************************************************************************
	函数名   : GetLocalShareDevice
	功能     : 获取全局共享使能标志
	参数     : [IN]  bOn  : 是否开启
	返回值   : 是否成功 0：成功； 非0失败
	*******************************************************************************/
	EC_CALL_API int GetLocalShareDevice(bool* bOn);	

	/*! @function
     ********************************************************************************
     函数名   : GetShareScreenInfo
     功能     : 查询屏幕信息。
     参数     : [IN] screenId :屏幕信息  
     返回值   : 个数
     *********************************************************************************/
	 EC_CALL_API int GetShareScreenInfo(long long** screenId);
	
	/*! @function
     ********************************************************************************
     函数名   : GetShareWindowInfo
     功能     : 查询窗口信息。
     参数     : [IN] info :窗口信息ECShareWindowInfo
     返回值   : 个数
     *********************************************************************************/
	 EC_CALL_API int GetShareWindowInfo(ECShareWindowInfo **  info);
	  
	/*! @function
     ********************************************************************************
     函数名   : ResetVideoView
     功能     : 通话中重置窗体
     参数     : [IN] callid    : 当前呼叫的唯一标识.
                [IN] remoteView: 对方显示视图
				[IN] localView : 本地显示视图
     返回值   : 是否成功 0：成功； 非0失败
     *******************************************************************************/
     EC_CALL_API int ResetVideoView(const char *callid, void* remoteView,void *localView);

	 /*! @function
     ********************************************************************************
     函数名   : GetCallType
     功能     : 获取通话的类型。思科后协商，需要在通话后获取真正呼叫类型
     参数     : [IN]  callid	  : 当前呼叫的唯一标识.
     返回值   : 成功返回 enum {//呼叫类型
				EC_VOICE_CALL=0,//语音VoIP电话
				EC_VIDEO_CALL,//音视频VoIP电话
				EC_VOICE_CALL_LANDING,//语音落地电话
				EC_SHARE_CALL,//共享VoIP电话
				EC_VOICE_SHARE_CALL,//语音和共享VoIP电话
				EC_VIDEO_SHARE_CALL,//音视频和共享VoIP电话
				};中值; 其他值失败
     *******************************************************************************/
     EC_CALL_API int GetCallType(const char *callid);

	 /*! @function
     ********************************************************************************
     函数名   : GetShareDeviceInfo
     功能     : 查询窗口信息。
     参数     : [IN] info :窗口信息ECShareDeviceInfo
     返回值   : 个数
     *********************************************************************************/
	 EC_CALL_API int GetShareDeviceInfo(ECShareDeviceInfo **  info);

	 /*! @function
     ********************************************************************************
     函数名   : GelectShareDevice
     功能     : 获得共享宽高。
     参数     :  [IN] type : 共享设备类行0 screen; 1 windows
				 [IN] id   : 共享设备id
				 [IN] width : 共享宽
				 [IN] height  : 共享高
     返回值   :  是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int GetShareDeviceSize(int type,long long id, int *width, int *height);
	 
	 /*! @function
	 ********************************************************************************
	 函数名   : SetScreenSharedRegion
	 功能     : 设置屏幕共享区域. 对共享设备类型 0 screen有效.
	 参数     :  [IN] left    : 共享区域左顶点left值
				 [IN] top     : 共享区域左顶点top值
				 [IN] right   : 共享区域右底点right值
				 [IN] bottom  : 共享区域右底点bottom值
	 返回值   :  是否成功 0：成功； 非0失败
	 *********************************************************************************/
	 EC_CALL_API int SetScreenSharedRegion(int left, int top, int right, int bottom);

	 /*! @function
     ********************************************************************************
     函数名   : SelectShareDevice
     功能     : 选择共享。可以在通话过程中已经共享后选择；
     参数     :  [IN] type   : 共享设备类行0 screen; 1 windows
				 [IN] id     : 共享设备id
				 [IN] maxFps : 共享设备编码最大分辩率1-30. 底层默认15
				 [IN] scale  : 共享设备编码缩放比。底层默认1.0
     返回值   :  是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int SelectShareDevice(int type,long long id,int maxFps,float scale);

	 /*! @function
     ********************************************************************************
     函数名   : SetShareScaleMode
     功能     : 设置共享设备上行编码缩放模式。
     参数     :  [IN] mode  : 共享上行编码缩放模式。 0缩放值模式； 1固定宽高模式
	 			 [IN] width : 共享宽。mode=1有效 内部默认1280
				 [IN] height: 共享高。mode=1有效 内部默认720
     返回值   :  是否成功 0：成功； 非0失败
     *********************************************************************************/
	 EC_CALL_API int SetShareScaleMode(int mode,int width, int height);
	 
	 /*! @function
	************************************************************************
	 函数名 : getLocalVideoSnapshot
	 功能 : 本地快照。
	 参数 : [IN] callid : 当前呼叫的唯一标识.
			[IN] fileName : 快照文件保存的全路径，含后缀名.jpg
			[OUT]  buf	      : 图像内存指针
			[OUT]  size	      : 图像内存大小
			[OUT]  width	  : 图像宽
			[OUT]  height	  : 图像高			
	 返回值 : 是否成功 0：成功； 非0失败
	 ***********************************************************************/
	 EC_CALL_API int GetLocalVideoSnapshot(const char* callid, const char* fileName);
	 EC_CALL_API int GetLocalVideoSnapshotEx(const char* callid, unsigned char **buf, unsigned int *size, unsigned int *width, unsigned int *height); 

	 /*! @function ************************************************************************
	 函数名 : getRemoteVideoSnapshot
	 功能 : 远程快照。
	 参数 : [IN] callid : 当前呼叫的唯一标识.
			[IN] fileName : 快照文件保存的全路径，含后缀名.jpg
			[OUT]  buf	      : 图像内存指针
			[OUT]  size	      : 图像内存大小
			[OUT]  width	  : 图像宽
			[OUT]  height	  : 图像高			
	 返回值 : 是否成功 0：成功； 非0失败
	 ***********************************************************************/
	 EC_CALL_API int GetRemoteVideoSnapshot(const char* callid, const char* fileName);
	 EC_CALL_API int GetRemoteVideoSnapshotEx(const char* callid, unsigned char **buf, unsigned int *size, unsigned int *width, unsigned int *height);

	 /*! @function ************************************************************************
	 函数名 : startRecordScreen
	 功能 : 通话过程中，开始录屏
	 参数 : [IN] callid : 会话id；
	 [IN] filename：录屏保存的文件名；
	 [IN] bitrate：调节录屏压缩码流，默认640；
	 [IN] fps：录屏的帧数，默认10帧每秒；
	 [IN] type: 录屏的屏幕选择， 0：主屏 1：辅屏
	 返回值 : 0：成功 -1：失败
	 ***********************************************************************/
	 EC_CALL_API int StartRecordScreen(const char *callid, const char *filename, int bitrate, int fps, int type);


	 /*! @function ************************************************************************
	 函数名 : startRecordScreenEx
	 功能 : 通话过程中，开始录屏
	 参数 : [IN] callid : 会话id；
	 [IN] filename：录屏保存的文件名；
	 [IN] bitrate：调节录屏压缩码流，默认640；
	 [IN] fps：录屏的帧数，默认10帧每秒；
	 [IN] type: 录屏的屏幕选择， 0：主屏 1：辅屏
	 [IN] left, top, width, height : 屏幕区域
	 返回值 : 0：成功 -1：失败
	 ***********************************************************************/
	 EC_CALL_API int StartRecordScreenEx(const char *callid, const char *filename, int bitrate, int fps, int type, int left, int top, int width, int height);

	 /*! @function ************************************************************************
	 函数名 : stopRecordScreen
	 功能 : 停止录屏，通话结束时，会主动调用本函数。
	 参数 : [IN] callid : 会话id；
	 返回值 : 0：成功 -1：失败
	 ***********************************************************************/
	 EC_CALL_API int StopRecordScreen(const char *callid);
	 
	 /*! @function ************************************************************************
	 函数名 : GetCallData
	 功能 : 根据用户传的key获取来电的UserData相应的数据,被叫在来电之后调用，主叫在通话后调用
	 参数 : [IN]  key : 用户传的关键字
			[OUT] valueData:key相应的数据，需要用户先申请某个长度的Buffer，长度会先下通知给用户，接口会将value写入到Buffer中
	 返回值 : 0:成功
	 ***********************************************************************/
	 EC_CALL_API int GetCallData(const char* key, char* valueData);

	 /*! @function
	 ************************************************************************
	 函数名 : SetSrtpEnabled
	 功能 : 设置SRTP加密属性，媒体加密传输.
	 参数 : [IN] TransportType :是否加密。0 不加密，1 加密
			[IN] cryptoType :加密算法，默认2，TransportType为1时有效
							 typedef enum {//加密算法
								 AES_128_SHA1_80 =1,
								 AES_128_SHA1_32 =2,
								 AES_256_SHA1_80 =3,
								 AES_256_SHA1_32 =4,
							 }SrtpCryptoType;
	 返回值 : 无
	 ***********************************************************************/
	 EC_CALL_API void SetSrtpEnabled(int TransportType,int cryptoType);

	 /*! @function
	 ************************************************************************
     函数名   : SetNatTraversal
     功能     : 设置P2P打洞 
     参数     : [IN] bNatP2P :  开启打洞。true 开启，false 关闭；默认开启
     返回值   : 是否成功 0：成功； 非0失败
     *******************************************************************/
     EC_CALL_API int SetNatTraversal(bool bNatP2P);

	 /*! @function
	 ************************************************************************
	 函数名 : StartRecordRemoteVideo
	 功能 : 开始远端录像。
	 参数 : [IN] callid : 当前呼叫的唯一标识.
			[IN] fileName : 文件保存的全路径，含后缀名.mp4
	 返回值 : 是否成功 0：成功； 非0失败
	 ***********************************************************************/
	 EC_CALL_API int StartRecordRemoteVideo(const char* callid, const char* fileName);

	 /*! @function
	 ************************************************************************
     函数名   : StopRecordRemoteVideo
     功能     : 停止远端录像。
     参数     : [IN]  callid      : 当前呼叫的唯一标识.
     返回值   : 是否成功 0：成功； 非0失败
     ***********************************************************************/
     EC_CALL_API int StopRecordRemoteVideo(const char* callid);

	 /*! @function
	 ************************************************************************
     函数名   : StartRecordLocalVideo
     功能     : 开始本端录像。
     参数     : [IN]  callid      : 当前呼叫的唯一标识.
                [IN]  fileName    : 文件保存的全路径，含后缀名.mp4
     返回值   : 是否成功 0：成功； 非0失败
     ***********************************************************************/
     EC_CALL_API int StartRecordLocalVideo(const char* callid, const char* filename);

	 /*! @function
	 ************************************************************************
     函数名   : StopRecordLocalVideo
     功能     : 停止本端录像。
     参数     : [IN]  callid      : 当前呼叫的唯一标识.
     返回值   : 是否成功 0：成功； 非0失败
     ***********************************************************************/
     EC_CALL_API int StopRecordLocalVideo(const char* callid);
	 
	 /*! @function
     ********************************************************************************
     函数名   : SetBeautyFilter
     功能     : 设置美颜处理。支持通话中实时生效
     参数     : [IN] enable：是否美颜，底层默认非美颜。
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int SetBeautyFilter(bool enable);
	
	/*! @function
	********************************************************************************
	函数名   : SetVideoWatermark
	功能     : 设置视频滤镜。支持通话中实时生效
	参数     : [IN] watermark：水印参数， with, height
	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int SetVideoWatermark(ECWaterMark watermark, int width, int height);

	/*! @function
     ********************************************************************************
     函数名   : SetLevelIdc
     功能     : 设置接收分辨率级别。根据长、宽、最大帧计算出级别
     参数     : [IN] width: 宽
	            [IN] height: 高
				[IN] fps: 最大帧
				[IN] level: 直接级别（可选）。默认-1；当(level>=10&&level<=52)，width,height,fps失效
     返回值   :  是否成功 0：成功； 非0失败
     *******************************************************************************/
	EC_CALL_API int SetLevelIdc(int width,int height,float fps,int level);
    
	EC_CALL_API int SetSDPProfile(int profileIndication,int profileCompatibility);

	 //三方通话
	 /*! @function ************************************************************************
	 函数名: InviteJoinThreePartConf
	 功能 : 邀请加入会议
	 参数 : [IN] tcpMsgIdOut : 流水号
			[IN] callid      : 当前呼叫的唯一标识。必选
			[IN] member      : 被邀请者。必选
			[IN] disName     : 显号。 可选
			[IN] jsonString  : 备用字段，暂不启用
	 返回值 : 0成功，非0失败
	 ***********************************************************************/
	 EC_CALL_API int InviteJoinThreePartConf(unsigned int* matchKey,const char* callid, const char* member, const char* disName, const char* jsonString);
	 
	/*! @function
     ********************************************************************************
     函数名   : RequestThreeConfMemberVideo
     功能     : 三方通话中请求第三方远端视频
     参数     : [IN]  videoWindow      :  当成功请求时，展示该成员的窗口.
				[IN]  type             :  详见ECVideoDataType.默认摄像头像源1
				[IN]  jsonString       :  备用字段，暂不启用
     返回值   : 成功 0 失败 -1(remoteSipNo为NULL) -2(videoWindow为NULL) -3(conferenceId为NULL) -4(confPasswd为NULL) -5(自己的sip号为NULL) -6(会议服务器的ip为NULL) -7(该账户的视频已经成功请求) -8(正在停止当前用户视频流，需要等待)
     回调函数 ：void (*onRequestThreeConfMemberVideo)
	 *******************************************************************************/
	 EC_CALL_API int RequestThreeConfMemberVideo(void *videoWindow,int type, const char* jsonString);
	
	 /*! @function
     ********************************************************************************
     函数名   : CancelThreeConfMemberVideo
     功能     : 三方通话中停止第三方远端视频
     参数     : [IN]  type             :  详见ECVideoDataType.默认摄像头像源1
				[IN]  jsonString       :  备用字段
     返回值   : 成功 0 失败 -1(remoteSipNo为NULL) -3(conferenceId为NULL) -4(confPasswd为NULL) -5(自己的sip号为NULL) -6(会议服务器的ip为NULL) -7(该账户的视频没有成功请求)
	 回调函数 ：void (*onCancelThreeConfMemberVideo)
	 *******************************************************************************/
	 EC_CALL_API int CancelThreeConfMemberVideo(int type, const char* jsonString);

	/*! @function
    ********************************************************************************
     函数名   : GetMicVolume
	 功能     : 获取麦克风音量值
     参数    : [IN] volume ：范围：【0~255】
     返回值   : 是否成功 0：成功； 非0失败
    *******************************************************************************/
	EC_CALL_API  int GetMicVolume(unsigned int* volume);

	/*! @function
    ********************************************************************************
     函数名   : SetMicVolume
     功能     : 设置麦克风音量的默认值
     参数     : [IN] volume ：范围：【0~255】
     返回值   : 是否成功 0：成功； 非0失败
    *******************************************************************************/
	EC_CALL_API  int SetMicVolume(unsigned int volume);

	/*! @function
	********************************************************************************
	函数名   : PauseCall
	功能     : 暂停呼叫，呼叫暂停以后, 本地的语音数据将不再传递到对方.
	参数     : [IN]  callid	        : 当前呼叫的唯一标识
			   [IN]  jsonString     : 备用字段，暂不启用
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：	void (*onCallPaused)(const char* callid,int type,int reason);
	*******************************************************************************/
	EC_CALL_API int PauseCall(const char *callid, const char* jsonString);

	/*! @function
	********************************************************************************
	函数名   : ResumeCall
	功能     : 恢复暂停的呼叫
	参数     : [IN]  callid	        : 当前呼叫的唯一标识
			   [IN]  jsonString     : 备用字段，暂不启用
	返回值   : 是否成功 0：成功； 非0失败
	回调函数 ：void (*onCallResumed)(const char* callid,int type,int reason);
	*******************************************************************************/
	EC_CALL_API int ResumeCall(const char *callid, const char* jsonString);
	
	/*! @function
     ********************************************************************************
     函数名   : StartRecordPlayout
     功能     : 通话过程中，开始录制扬声器。主要用来协助媒体库研发定位问题
     参数     : [IN]  callid : 会话id；
                [IN] filename：保存的文件名。后缀名“.wav”；
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int StartRecordPlayout(const char *callid, const char *filename);

	/*! @function
     ********************************************************************************
     函数名   : StopRecordPlayout
     功能     : 停止录制扬声器。
     参数     : [IN]  callid : 会话id；
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int StopRecordPlayout(const char *callid);

	/*! @function
	********************************************************************************
	函数名   : startRecordPlayoutByConfId
	功能     : 通话过程中，开始录制扬声器。主要用来协助媒体库研发定位问题
	参数     : [IN]  confId : 会议id；
	[IN] filename：保存的文件名。后缀名“.wav”；
	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int StartRecordPlayoutByConfId(const char *confId, const char *filename);

	/*! @function
	********************************************************************************
	函数名   : stopRecordPlayoutByConfId
	功能     : 停止录制扬声器。
	参数     : [IN]  confId : 会议id；
	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int StopRecordPlayoutByConfId(const char *confId);

	/*! @function
     ********************************************************************************
     函数名   : StartRecordMicrophone
     功能     : 开始录制麦克风。主要用来协助媒体库研发定位问题
     参数     : [IN] filename：保存的文件名。后缀名“.wav”；
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int StartRecordMicrophone(const char *filename);

	/*! @function
     ********************************************************************************
     函数名   : StopRecordMicrophone
     功能     : 停止录制麦克风。
     参数     : 
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int StopRecordMicrophone();

	/*! @function
     ********************************************************************************
     函数名   : StartRecordSendVoice
     功能     : 开始录制上行音频数据。主要用来协助媒体库研发定位问题
     参数     : [IN] filename：保存的文件名。后缀名“.wav”；
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int StartRecordSendVoice(const char *filename);

	/*! @function
     ********************************************************************************
     函数名   : StopRecordSendVoice
     功能     : 停止录制上行音频数据。
     参数     : 
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int StopRecordSendVoice();
	
     /*! @function
     ********************************************************************************
     函数名   : SetProcessDataEnabled
     功能     : 设置允许上层处理音频数据。一旦设置，必须把数据传回底层，否则没有媒体数据
     参数     : [IN] bAudio	  : true 允许上层处理； false 不允许上层处理。底层默认false
                [IN] bVideo   : true 允许上层处理； false 不允许上层处理。底层默认false
     返回值   : 成功 0 失败-1
	 void (*onAudioData)(const char *callid, const void *inData, int inLen, void *outData, int *outLen, bool send);
	 void (*onVideoData)(const char *callid, const void *inData, int inLen, void *outData, int *outLen, bool send);
     *******************************************************************************/
    EC_CALL_API int SetProcessDataEnabled(bool bAudio,bool bVideo);

	/*! @function
	********************************************************************************
	函数名   : SetCaptureDataCallbackEnabled
	功能     : 设置设备采集原始音视频数据回调到上层。
	参数     : [IN] bAudio	  : 音频 true 允许； false 不允许。底层默认false
			   [IN] bVideo    : 视频 true 允许； false 不允许。底层默认false
	返回值   : 成功 0 失败-1
	void (*onAudioCaptureData)(const char *callid, unsigned char* data, int length, int samples, int sampleRate, int numChannels);
	void (*onVideoCaptureData)(const char *callid, unsigned char* data, int length, int width, int height, int y_stride, int uv_stride);
	*******************************************************************************/
	EC_CALL_API int SetCaptureDataCallbackEnabled(bool bAudio, bool bVideo);

	/*! @function
	********************************************************************************
	函数名   : SetRemoteDataCallbackEnabled
	功能     : 设置远端原始音视频数据回调到上层。
	参数     : [OUT] callback   : 回调指针onVideoRemoteData
	返回值   : 成功 0 失败非0
	*******************************************************************************/
	EC_CALL_API int SetRemoteDataCallbackEnabled(onVideoRemoteData callback);
	
	/*! @function
     ********************************************************************************
     函数名   :  SetVideoViewAttribute
	 功能     :  设置视频通话远端窗体大小。呼叫前和应答前调用
	 参数     :  [IN] width        : 宽
				 [IN] height       : 高
				 [IN] jsonString   : 备用扩展字段，暂不启用
     返回值   :  是否成功 0：成功； 非0失败 
     *********************************************************************************/
	EC_CALL_API int SetVideoViewAttribute(int width,int height, const char* jsonString);
	
	/*! @function
	********************************************************************************
	函数名   :  setVideoAutoMode
	功能     :  设置发送视频流的分辨率以及码率
	参数     :  [IN] width  : 宽
				[IN] height : 高
				[IN] targetBitrate 码率. 默认0，底层自动适配.
	返回值   :  是否成功 0：成功； 非0失败
	*********************************************************************************/
	EC_CALL_API int SetVideoAutoMode(int width, int height, int targetBitrate);

	/*! @function
     ********************************************************************************
     函数名   : SetMagicSound
     功能     : 变声。
     参数     : [IN]  callid : 会话id；
				[IN]  enable : 开启与关闭;
                [IN]  pitch  ：声调调节（变调不变速），取值[-12, 12]（0表示正常，原来声音音调，设置为+8的话，可以听到明显的女生效果）
				[IN]  tempo  ：音速调节（变速不变调），取值[-50, 50], 0表示正常原语速
     返回值   : 0：成功   非0：失败
     *******************************************************************************/
	EC_CALL_API int SetMagicSound(const char *callid,bool enable,int pitch, int tempo);

	/*! @function
	********************************************************************************
	函数名   : SetEasyMagicSound
	功能     : 设置变音简化接口。
	参数     : [IN]  callid : 会话id；
			   [IN]  enable : 开启与关闭;
	           [IN]  mode   ：模式。0：MagicSoundNormal(男变女，女变萌)
	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int SetEasyMagicSound(const char *callid, bool enable, int mode);

	/*! @function
	********************************************************************************
	函数名   : SetAudioSpeakerGain
	功能     : 设置音频输出增益。
	参数     : [IN]  callid : 会话id；
	[IN]  gain   : 大于1.0放大，小于1.0缩小；增益范围太大声音失真，建议1.5倍
	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int SetAudioSpeakerGain(const char *callid, float gain);

	/*! @function
	********************************************************************************
	函数名   : SetAudioMicrophoneGain
	功能     : 设置音频输入增益。
	参数     : [IN]  callid : 会话id；
	[IN]  gain   : 大于1.0放大，小于1.0缩小；增益范围太大声音失真，建议1.5倍
	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int SetAudioMicrophoneGain(const char *callid, float gain);

	/*! @function
	********************************************************************************
	函数名   : StartRtpDump
	功能     : 通话过程中，开始抓包。
	参数     : [IN]  callid   : 会话id；
	[IN]  mediaType:媒体类型
	enum {
	CCP_MEDIA_TYPE_AUDIO=0,//音频
	CCP_MEDIA_TYPE_VIDEO=1,//视频
	CCP_MEDIA_TYPE_SHARE=2,//共享
	};
	[IN]  fileName ：保存的文件名。后缀名“.pcap”
	[IN]  direction：方向。0下行，1上行

	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int StartRtpDump(const char *callid, int mediaType, const char *fileName, int direction);

	/*! @function
	********************************************************************************
	函数名   : StopRtpDump
	功能     : 通话过程中，停止抓包。
	参数     : [IN]  callid : 会话id；
	[IN]  mediaType:媒体类型
	enum {
	CCP_MEDIA_TYPE_AUDIO=0,//视频
	CCP_MEDIA_TYPE_VIDEO=1,//视频
	CCP_MEDIA_TYPE_SHARE=2,//共享
	};
	[IN]  direction：方向。0下行，1上行

	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int StopRtpDump(const char *callid, int mediaType, int direction);

	/*! @function
     ********************************************************************************
     函数名   : GetStatsReports
     功能     : 获取通话中的视频统计报告
     参数     :  [OUT] reportsJsonOut:  统计数据
					{
						"AudioStats":{
							"Receive":[{"codec_name":"opus","fraction_lost":0}],
							"SendStream":[{"codec_name":"opus","fraction_lost":0}]
						},
						"VideoStats":[
							{
								"SendStreams":[{"channel_id":1,"codec_name":"H264","encoded_kbps":0,"fraction_lost":0,"framerate":0,"height":0,"total_kbps":0,"width":0}]
							},{
								"SendStreams":[{"channel_id":2,"codec_name":"H264","encoded_kbps":0,"fraction_lost":0,"framerate":0,"height":0,"total_kbps":0,"width":0}]
							},{
								"ReceicverStreams":[{"channel_id":3,"codec_name":"H264","fraction_lost":0,"framerate":15,"height":480,"received_kbps":559,"width":640}]
							}
						],
						"TotalStats":{
							"Estimated_received_kbps":0,"Estimated_send_kbps":500,"Rtt_ms":4294967295
						}
					}
     返回值   :  是否成功 0：成功； 非0失败
     *****************************************************************************/
	EC_CALL_API int GetStatsReports(int* senderCount, ECSenderStatsReport** senderReports, int* receiverCount, ECReceiverStatsReport** receiverReports);//已废弃
	EC_CALL_API int GetStatsReportsEX( const char ** reportsJsonOut);

	/*! @function
	 ********************************************************************************
	 函数名   : GetStatsReportsSafe
	 功能     : 获取通话中的视频统计报告(数据安全接口)
	 参数     : [OUT] reportsBuf:  外部传入的缓冲区.
					返回统计数据：
					{
						"AudioStats":{
							"Receive":[{"codec_name":"opus","fraction_lost":0}],
							"SendStream":[{"codec_name":"opus","fraction_lost":0}]
						},
						"VideoStats":[
							{
								"SendStreams":[{"channel_id":1,"codec_name":"H264","encoded_kbps":0,"fraction_lost":0,"framerate":0,"height":0,"total_kbps":0,"width":0}]
							},{
								"SendStreams":[{"channel_id":2,"codec_name":"H264","encoded_kbps":0,"fraction_lost":0,"framerate":0,"height":0,"total_kbps":0,"width":0}]
							},{
								"ReceicverStreams":[{"channel_id":3,"codec_name":"H264","fraction_lost":0,"framerate":15,"height":480,"received_kbps":559,"width":640}]
							}
						],
						"TotalStats":{
							"Estimated_received_kbps":0,"Estimated_send_kbps":500,"Rtt_ms":4294967295
						}
					}
				[IN] maxBufLen : 传入的缓冲区最大长度.
	 返回值   : 是否成功 0：成功； > 0 参数异常，表示缓冲区不足返回当前实际长度； < 0 失败.
	 *****************************************************************************/
	EC_CALL_API int GetStatsReportsSafe(char *reportsBuf, int maxBufLen);

	EC_CALL_API int GetCallMemberUUID(char** outSelfUUID, char** outParpartnerUUID);

	/*! @function
	********************************************************************************
	函数名   : StartRecordP2P
	功能     : 开始点对点视频录制。
	参数     : 
	[IN]  matchKey : 流水号；
	[IN]  callid : 会话id；
	[IN]  recordType : 录像文件类型，目前只支持flv,aac,h264,mp4,jpeg。例如flv,aac,h264 参数表示同时录制 flv,h264 两个视频文件 和 aac 一个音频文件
	[IN]  outputPath : 录像文件输出路径输出格式: aaa/bbb/
	[IN]  outputFilename : 录像文件名，不带扩展名
	[IN]  layoutIdx :布局：-1 自动； 0 首成员大屏显示，其他成员小屏显示，首个成员即 members 参数中第一个成员
	[IN]  resolutionIdx  ：分辩率索引，分辨率与码率有固定值，根据不同索引，设置这些固定值
							0:320,180,15
							1:480,270,15"
							2:640,360,15
							3:960,540,15
							4:1280,720,15
	[IN]  model  ：混屏切换模式: 
						auto:自动布局，自动布局时，视频画面自动处理所有会议成员的布局，忽略 members 参数，并且开启屏幕共享时，视频画面会自动切换到屏幕共享。
						manual:手动布局，手动布局时，视频画面仅显示指定成员的视频， members 是必选参数
	[IN]  members : 所控制的会议成员。内容包括： 成员媒体ID: msUuid； 媒体源类型： srcType，1:代表摄像头视频 2:代表共享视频。不带类型为成员视频
	[IN]  rtmpPushUrl : 直播推流地址，将录像直播到该地址
	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int StartRecordP2P(unsigned int* matchKey, const char* callid, const char* recordType, const char* outputPath, const char* outputFilename, const char* layoutIdx, const char* resolutionIdx, const char* model, const char* members, const char* rtmpPushUrl);

	/*! @function
	********************************************************************************
	函数名   : StopRecordP2P
	功能     : 停止点对点视频录制。。
	参数     :
	[IN]  matchKey : 流水号；
	[IN]  callid : 会话id；
	[IN]  sessionId : 会话Id

	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int StopRecordP2P(unsigned int* matchKey, const char* callid, const char* sessionId);

	/*! @function
	********************************************************************************
	函数名   : RecordP2pSwitchMember
	功能     : 点对点录制成员切换。
	参数     : 
	[IN]  matchKey : 流水号；
	[IN]  callid : 会话id；
	[IN]  sessionId : 会话Id
	[IN]  layoutIdx :布局：-1 自动； 0 首成员大屏显示，其他成员小屏显示，首个成员即 members 参数中第一个成员
	[IN]  model  ：混屏切换模式:
					auto:自动布局，自动布局时，视频画面自动处理所有会议成员的布局，忽略 members 参数，并且开启屏幕共享时，视频画面会自动切换到屏幕共享。
					manual:手动布局，手动布局时，视频画面仅显示指定成员的视频， members 是必选参数
	[IN]  members : 所控制的会议成员。内容包括： 成员媒体ID: msUuid； 媒体源类型： srcType，1:代表摄像头视频 2:代表共享视频。不带类型为成员视频
	[IN]  rtmpPushUrl : 直播推流地址，将录像直播到该地址

	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int RecordP2pSwitchMember(unsigned int* matchKey, const char* callid, const char* sessionId, const char* layoutIdx, const char* model, const char* members);

	/*! @function
	********************************************************************************
	函数名   : RecordP2pGetFileList
	功能     : 停止点对点视频录制。。
	参数     :
	[IN]  matchKey : 流水号；
	[IN]  callid : 会话id；
	[IN]  sessionId : 会话Id

	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int RecordP2pGetFileList(unsigned int* matchKey, const char* callid, const char* sessionId);

	/*! @function
	********************************************************************************
	函数名   : RecordP2pDelete
	功能     : 删除点对点录制文件。
	参数     :
	[IN]  matchKey : 流水号；
	[IN]  callid : 会话id；
	[IN]  sessionId : 会话Id
	[IN]  filename : 录像文件名， 需要带扩展名如test.flv, test.*。.*是代表同时删除mp4,flv,aac,h264文件, 如果正在录相的文件，是不能删除的。
	[IN]  prefix : 文件路径匹配值， 如果带该参数，只有录像存放路径中，有prefix的值，才删除，否则，不删除，为空时，删除会议下所有filename的文件

	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int RecordP2pDelete(unsigned int* matchKey, const char* callid, const char* sessionId, const char* filename, const char* prefix);

	/*! @function
	********************************************************************************
	函数名   : SetReportEngineEnable
	功能     : 设置墨镜可用性。
	参数     :
	[IN]  bEnable : 是否使用墨镜；

	返回值   : 0：成功   非0：失败
	*******************************************************************************/
	EC_CALL_API int SetReportEngineEnable(bool bEnable);


#ifdef __cplusplus
}
#endif

#endif