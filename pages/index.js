
import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useRouter } from "next/router";
import {
    createServer,
    getUserServers,
    createChannel,
    getServerChannels,
    sendMessage,
    sendMessageWithImage,
    getChannelMessages,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    getUserDMs,
    createDMChannel,
    sendFriendRequest,
    getServerMembers,
    addMemberToServer,
    inviteUserToServer,
    saveUserInfo,
    getMemberPermissions,
    hasPermission,
    DEFAULT_PERMISSIONS,
    getImage
} from "../lib/firestore";
import ServerSidebar from "../components/ServerSidebar";
import ChannelSidebar from "../components/ChannelSidebar";
import FriendsList from "../components/FriendsList";
import MemberList from "../components/MemberList";
import ServerInvites from "../components/ServerInvites";
import RoleManager from "../components/RoleManager";
import ImageUploader from "../components/ImageUploader";

export default function ChatPage() {
    const [user, setUser] = useState(null);
    const [servers, setServers] = useState([]);
    const [currentServer, setCurrentServer] = useState(null);
    const [channels, setChannels] = useState([]);
    const [currentChannel, setCurrentChannel] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [editingMessage, setEditingMessage] = useState(null);
    const [replyingTo, setReplyingTo] = useState(null);
    const [dmChannels, setDmChannels] = useState([]);
    const [showMemberList, setShowMemberList] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [showRoleManager, setShowRoleManager] = useState(false);
    const [showImageUploader, setShowImageUploader] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [userPermissions, setUserPermissions] = useState([]);
    const [imageAttachment, setImageAttachment] = useState(null);
    const messagesEndRef = useRef(null);
    const router = useRouter();

    // 認証状態チェック
    useEffect(() => {
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                // ユーザー情報をFirestoreに保存
                try {
                    await saveUserInfo(currentUser.uid, {
                        displayName: currentUser.displayName || '匿名',
                        email: currentUser.email,
                        photoURL: currentUser.photoURL
                    });
                } catch (error) {
                    console.error('ユーザー情報保存エラー:', error);
                }
            } else {
                router.push("/login");
            }
        });
        return () => unsubscribeAuth();
    }, [router]);

    // ユーザーのサーバー取得
    useEffect(() => {
        if (!user) return;

        const unsubscribe = getUserServers(user.uid, (snapshot) => {
            const serverList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setServers(serverList);
            
            if (serverList.length > 0 && !currentServer) {
                setCurrentServer(serverList[0]);
            }
        });

        return () => unsubscribe();
    }, [user]);

    // DM取得
    useEffect(() => {
        if (!user) return;

        const unsubscribe = getUserDMs(user.uid, (snapshot) => {
            const dmList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setDmChannels(dmList);
        });

        return () => unsubscribe();
    }, [user]);

    // サーバーのチャンネル取得
    useEffect(() => {
        if (!currentServer) return;

        const unsubscribe = getServerChannels(currentServer.id, (snapshot) => {
            const channelList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setChannels(channelList);
            
            if (channelList.length > 0 && !currentChannel) {
                setCurrentChannel(channelList[0]);
            }
        });

        return () => unsubscribe();
    }, [currentServer]);

    // チャンネルのメッセージ取得
    useEffect(() => {
        if (!currentChannel) return;

        const unsubscribe = getChannelMessages(currentChannel.id, (snapshot) => {
            const messageList = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => {
                if (!a.timestamp || !b.timestamp) return 0;
                const timeA = a.timestamp.seconds || 0;
                const timeB = b.timestamp.seconds || 0;
                return timeA - timeB;
            });
            setMessages(messageList);
            scrollToBottom();
        });

        return () => unsubscribe();
    }, [currentChannel]);

    // ユーザー権限取得
    useEffect(() => {
        if (!user || !currentServer || currentServer.id === 'dm') return;

        const fetchPermissions = async () => {
            try {
                const permissions = await getMemberPermissions(currentServer.id, user.uid);
                setUserPermissions(permissions);
            } catch (error) {
                console.error('権限取得エラー:', error);
                setUserPermissions([]);
            }
        };

        fetchPermissions();
    }, [user, currentServer]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const handleSendMessage = async () => {
        if ((!input.trim() && !imageAttachment) || !user || !currentChannel) return;
        
        // 送信権限チェック
        if (!hasPermission(userPermissions, DEFAULT_PERMISSIONS.SEND_MESSAGES)) {
            alert('メッセージを送信する権限がありません');
            return;
        }

        if (editingMessage) {
            await editMessage(editingMessage.id, input.trim());
            setEditingMessage(null);
        } else {
            if (imageAttachment) {
                await sendMessageWithImage(
                    currentChannel.id,
                    user.uid,
                    user.displayName || "匿名",
                    input.trim(),
                    imageAttachment.id,
                    replyingTo?.id
                );
            } else {
                await sendMessage(
                    currentChannel.id,
                    user.uid,
                    user.displayName || "匿名",
                    input.trim(),
                    replyingTo?.id
                );
            }
            setReplyingTo(null);
        }

        setInput("");
        setImageAttachment(null);
    };

    const handleImageUpload = (uploadedImage) => {
        setImageAttachment(uploadedImage);
        setShowImageUploader(false);
    };

    const handleServerCreate = async (serverName) => {
        if (!user) return;
        await createServer(serverName, user.uid, user.displayName || "匿名");
    };

    const handleChannelCreate = async (channelData) => {
        if (!user || !currentServer) return;
        await createChannel(channelData.name, channelData.type, currentServer.id, user.uid);
    };

    const handleSignOut = async () => {
        await signOut(auth);
        router.push("/login");
    };

    const handleReaction = async (messageId, emoji) => {
        if (!user) return;
        
        const message = messages.find(m => m.id === messageId);
        const userReacted = message.reactions?.[emoji]?.includes(user.uid);
        
        if (userReacted) {
            await removeReaction(messageId, user.uid, emoji);
        } else {
            await addReaction(messageId, user.uid, emoji);
        }
    };

    const handleInviteUser = async () => {
        if (!inviteEmail.trim() || !currentServer) return;
        
        try {
            await inviteUserToServer(
                currentServer.id, 
                inviteEmail.trim(), 
                user.displayName || '匿名'
            );
            alert('招待を送信しました');
            setInviteEmail('');
            setShowInviteModal(false);
        } catch (error) {
            console.error('招待エラー:', error);
            alert(error.message || '招待に失敗しました');
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return "";
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return "";
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) {
            return "今日";
        } else if (date.toDateString() === yesterday.toDateString()) {
            return "昨日";
        } else {
            return date.toLocaleDateString();
        }
    };

    return (
        <div style={{
            display: 'flex',
            height: '100vh',
            backgroundColor: '#36393f',
            color: '#dcddde',
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
        }}>
            {/* サーバーサイドバー */}
            <ServerSidebar
                servers={servers}
                currentServer={currentServer?.id}
                onServerSelect={(serverId) => {
                    if (serverId === 'dm') {
                        setCurrentServer({ id: 'dm', name: 'ダイレクトメッセージ' });
                        setChannels(dmChannels);
                        setCurrentChannel(null);
                    } else {
                        const server = servers.find(s => s.id === serverId);
                        setCurrentServer(server);
                        setCurrentChannel(null);
                    }
                }}
                onCreateServer={handleServerCreate}
            />

            {/* チャンネルサイドバー / フレンドリスト */}
            {currentServer?.id === 'dm' ? (
                <FriendsList user={user} />
            ) : currentServer ? (
                <ChannelSidebar
                    server={currentServer}
                    channels={channels}
                    currentChannel={currentChannel?.id}
                    onChannelSelect={(channelId) => {
                        const channel = channels.find(c => c.id === channelId);
                        setCurrentChannel(channel);
                    }}
                    onCreateChannel={handleChannelCreate}
                    user={user}
                />
            ) : null}

            {/* メインチャットエリア */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {/* ヘッダー */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 20px',
                    backgroundColor: '#2f3136',
                    borderBottom: '1px solid #202225'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <h2 style={{
                            margin: 0,
                            fontSize: 18,
                            fontWeight: 600,
                            color: '#ffffff'
                        }}>
                            {currentChannel ? `# ${currentChannel.name}` : 'チャンネルを選択してください'}
                        </h2>
                        
                        {currentServer && currentServer.id !== 'dm' && (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                    onClick={() => setShowMemberList(true)}
                                    style={{
                                        backgroundColor: '#40444b',
                                        color: '#dcddde',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '6px 12px',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    👥 メンバー
                                </button>
                                <button
                                    onClick={() => setShowInviteModal(true)}
                                    style={{
                                        backgroundColor: '#40444b',
                                        color: '#dcddde',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '6px 12px',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    ➕ 招待
                                </button>
                                {hasPermission(userPermissions, DEFAULT_PERMISSIONS.MANAGE_ROLES) && (
                                    <button
                                        onClick={() => setShowRoleManager(true)}
                                        style={{
                                            backgroundColor: '#40444b',
                                            color: '#dcddde',
                                            border: 'none',
                                            borderRadius: '4px',
                                            padding: '6px 12px',
                                            cursor: 'pointer',
                                            fontSize: '14px'
                                        }}
                                    >
                                        🎭 ロール
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    
                    {user && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button
                                onClick={() => router.push("/mypage")}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#b9bbbe',
                                    cursor: 'pointer',
                                    padding: '8px',
                                    borderRadius: '4px'
                                }}
                            >
                                👤 {user.displayName || "匿名"}
                            </button>
                            <button
                                onClick={handleSignOut}
                                style={{
                                    backgroundColor: '#5865f2',
                                    color: 'white',
                                    border: 'none',
                                    padding: '8px 16px',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                }}
                            >
                                ログアウト
                            </button>
                        </div>
                    )}
                </div>

                {/* メッセージエリア */}
                {currentChannel && (
                    <>
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '20px'
                        }}>
                            {messages.map((msg, index) => {
                                const showAvatar = index === 0 || messages[index - 1].userId !== msg.userId;
                                const showDate = index === 0 || 
                                    formatDate(messages[index - 1].timestamp) !== formatDate(msg.timestamp);
                                
                                return (
                                    <div key={msg.id}>
                                        {showDate && (
                                            <div style={{
                                                textAlign: 'center',
                                                margin: '20px 0',
                                                color: '#72767d',
                                                fontSize: '12px'
                                            }}>
                                                {formatDate(msg.timestamp)}
                                            </div>
                                        )}
                                        
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '16px',
                                            padding: showAvatar ? '8px 0' : '2px 0',
                                            borderRadius: '4px',
                                            position: 'relative'
                                        }}
                                        onMouseEnter={(e) => {
                                            const buttons = e.currentTarget.querySelector('.message-buttons');
                                            if (buttons) buttons.style.opacity = '1';
                                        }}
                                        onMouseLeave={(e) => {
                                            const buttons = e.currentTarget.querySelector('.message-buttons');
                                            if (buttons) buttons.style.opacity = '0';
                                        }}>
                                            {showAvatar ? (
                                                <div style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    borderRadius: '50%',
                                                    backgroundColor: '#5865f2',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '18px',
                                                    fontWeight: '600',
                                                    color: 'white'
                                                }}>
                                                    {(msg.userName || "匿").charAt(0).toUpperCase()}
                                                </div>
                                            ) : (
                                                <div style={{ width: '40px' }} />
                                            )}
                                            
                                            <div style={{ flex: 1 }}>
                                                {showAvatar && (
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'baseline',
                                                        gap: '8px',
                                                        marginBottom: '4px'
                                                    }}>
                                                        <span style={{
                                                            fontWeight: '600',
                                                            color: '#ffffff',
                                                            fontSize: '16px'
                                                        }}>
                                                            {msg.userName || "匿名"}
                                                        </span>
                                                        <span style={{
                                                            fontSize: '12px',
                                                            color: '#72767d'
                                                        }}>
                                                            {formatTime(msg.timestamp)}
                                                            {msg.edited && <span> (編集済み)</span>}
                                                        </span>
                                                    </div>
                                                )}
                                                
                                                {msg.replyTo && (
                                                    <div style={{
                                                        backgroundColor: '#2f3136',
                                                        padding: '8px',
                                                        borderRadius: '4px',
                                                        marginBottom: '8px',
                                                        borderLeft: '4px solid #5865f2'
                                                    }}>
                                                        返信中...
                                                    </div>
                                                )}
                                                
                                                <div style={{
                                                    fontSize: '16px',
                                                    lineHeight: '1.375',
                                                    color: '#dcddde',
                                                    wordWrap: 'break-word'
                                                }}>
                                                    {msg.content}
                                                </div>
                                                
                                                {/* 画像添付 */}
                                                {msg.attachments && msg.attachments.length > 0 && (
                                                    <div style={{ marginTop: '8px' }}>
                                                        {msg.attachments.map((attachment, index) => (
                                                            attachment.type === 'image' && (
                                                                <ImageDisplay 
                                                                    key={index}
                                                                    imageId={attachment.id}
                                                                />
                                                            )
                                                        ))}
                                                    </div>
                                                )}
                                                
                                                {/* リアクション */}
                                                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                                    <div style={{
                                                        display: 'flex',
                                                        gap: '4px',
                                                        marginTop: '8px'
                                                    }}>
                                                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                                                            <button
                                                                key={emoji}
                                                                onClick={() => handleReaction(msg.id, emoji)}
                                                                style={{
                                                                    backgroundColor: users.includes(user?.uid) ? '#5865f2' : '#2f3136',
                                                                    border: '1px solid #40444b',
                                                                    borderRadius: '12px',
                                                                    padding: '4px 8px',
                                                                    color: '#dcddde',
                                                                    cursor: 'pointer',
                                                                    fontSize: '12px'
                                                                }}
                                                            >
                                                                {emoji} {users.length}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* メッセージボタン */}
                                            {msg.userId === user?.uid && (
                                                <div className="message-buttons" style={{
                                                    position: 'absolute',
                                                    right: '20px',
                                                    top: '8px',
                                                    display: 'flex',
                                                    gap: '4px',
                                                    opacity: '0',
                                                    transition: 'opacity 0.2s'
                                                }}>
                                                    <button
                                                        onClick={() => {
                                                            setEditingMessage(msg);
                                                            setInput(msg.content);
                                                        }}
                                                        style={{
                                                            backgroundColor: '#40444b',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px',
                                                            color: '#dcddde',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => deleteMessage(msg.id)}
                                                        style={{
                                                            backgroundColor: '#40444b',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px',
                                                            color: '#dcddde',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        🗑️
                                                    </button>
                                                    <button
                                                        onClick={() => setReplyingTo(msg)}
                                                        style={{
                                                            backgroundColor: '#40444b',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px',
                                                            color: '#dcddde',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        💬
                                                    </button>
                                                    <button
                                                        onClick={() => handleReaction(msg.id, '👍')}
                                                        style={{
                                                            backgroundColor: '#40444b',
                                                            border: 'none',
                                                            borderRadius: '4px',
                                                            padding: '4px',
                                                            color: '#dcddde',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        👍
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* 入力エリア */}
                        <div style={{
                            padding: '20px',
                            backgroundColor: '#36393f',
                            borderTop: '1px solid #40444b'
                        }}>
                            {(editingMessage || replyingTo) && (
                                <div style={{
                                    backgroundColor: '#2f3136',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    marginBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span style={{ color: '#dcddde', fontSize: '14px' }}>
                                        {editingMessage ? '編集中...' : `${replyingTo.userName}に返信中...`}
                                    </span>
                                    <button
                                        onClick={() => {
                                            setEditingMessage(null);
                                            setReplyingTo(null);
                                            setInput('');
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#72767d',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                            
                            {/* 画像プレビュー */}
                            {imageAttachment && (
                                <div style={{
                                    backgroundColor: '#2f3136',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    marginBottom: '8px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <img
                                            src={imageAttachment.url}
                                            alt="添付画像"
                                            style={{
                                                width: '40px',
                                                height: '40px',
                                                objectFit: 'cover',
                                                borderRadius: '4px'
                                            }}
                                        />
                                        <span style={{ color: '#dcddde', fontSize: '14px' }}>
                                            {imageAttachment.name}
                                        </span>
                                    </div>
                                    <button
                                        onClick={() => setImageAttachment(null)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#72767d',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>
                            )}
                            
                            <div style={{
                                backgroundColor: '#40444b',
                                borderRadius: '8px',
                                padding: '12px',
                                display: 'flex',
                                alignItems: 'flex-end',
                                gap: '12px'
                            }}>
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSendMessage();
                                        }
                                    }}
                                    placeholder={`#${currentChannel.name} にメッセージを送信`}
                                    style={{
                                        flex: 1,
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        color: '#dcddde',
                                        fontSize: '16px',
                                        resize: 'none',
                                        outline: 'none',
                                        fontFamily: 'inherit',
                                        lineHeight: '1.375',
                                        minHeight: '24px',
                                        maxHeight: '120px'
                                    }}
                                    rows={1}
                                />
                                
                                {hasPermission(userPermissions, DEFAULT_PERMISSIONS.ATTACH_FILES) && (
                                    <button
                                        onClick={() => setShowImageUploader(true)}
                                        style={{
                                            backgroundColor: '#40444b',
                                            color: '#dcddde',
                                            border: 'none',
                                            borderRadius: '4px',
                                            width: '32px',
                                            height: '32px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '16px'
                                        }}
                                    >
                                        📎
                                    </button>
                                )}
                                
                                <button
                                    onClick={handleSendMessage}
                                    disabled={!input.trim() && !imageAttachment}
                                    style={{
                                        backgroundColor: (input.trim() || imageAttachment) ? '#5865f2' : '#4f545c',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        width: '32px',
                                        height: '32px',
                                        cursor: (input.trim() || imageAttachment) ? 'pointer' : 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '16px'
                                    }}
                                >
                                    ➤
                                </button>
                            </div>
                        </div>
                    </>
                )}
                
                {/* メンバーリストモーダル */}
                {showMemberList && (
                    <MemberList
                        server={currentServer}
                        currentUser={user}
                        onClose={() => setShowMemberList(false)}
                    />
                )}
                
                {/* 招待モーダル */}
                {showInviteModal && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}>
                        <div style={{
                            backgroundColor: '#36393f',
                            borderRadius: '8px',
                            padding: '24px',
                            width: '400px',
                            maxWidth: '90vw'
                        }}>
                            <h2 style={{
                                color: '#ffffff',
                                fontSize: '20px',
                                fontWeight: '600',
                                margin: '0 0 16px 0'
                            }}>
                                ユーザーを招待
                            </h2>
                            
                            <input
                                type="email"
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                placeholder="メールアドレス"
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    backgroundColor: '#40444b',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: '#dcddde',
                                    fontSize: '16px',
                                    marginBottom: '16px',
                                    boxSizing: 'border-box'
                                }}
                            />
                            
                            <div style={{
                                display: 'flex',
                                justifyContent: 'flex-end',
                                gap: '12px'
                            }}>
                                <button
                                    onClick={() => {
                                        setShowInviteModal(false);
                                        setInviteEmail('');
                                    }}
                                    style={{
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        color: '#ffffff',
                                        padding: '10px 16px',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '14px'
                                    }}
                                >
                                    キャンセル
                                </button>
                                <button
                                    onClick={handleInviteUser}
                                    disabled={!inviteEmail.trim()}
                                    style={{
                                        backgroundColor: inviteEmail.trim() ? '#5865f2' : '#4f545c',
                                        border: 'none',
                                        color: 'white',
                                        padding: '10px 16px',
                                        borderRadius: '4px',
                                        cursor: inviteEmail.trim() ? 'pointer' : 'not-allowed',
                                        fontSize: '14px'
                                    }}
                                >
                                    招待
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {/* ロール管理モーダル */}
                {showRoleManager && (
                    <RoleManager
                        server={currentServer}
                        currentUser={user}
                        onClose={() => setShowRoleManager(false)}
                    />
                )}
                
                {/* 画像アップロードモーダル */}
                {showImageUploader && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000
                    }}>
                        <div style={{
                            backgroundColor: '#36393f',
                            borderRadius: '8px',
                            padding: '24px',
                            width: '400px',
                            maxWidth: '90vw'
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px'
                            }}>
                                <h2 style={{
                                    color: '#ffffff',
                                    fontSize: '20px',
                                    fontWeight: '600',
                                    margin: 0
                                }}>
                                    画像をアップロード
                                </h2>
                                <button
                                    onClick={() => setShowImageUploader(false)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#b9bbbe',
                                        cursor: 'pointer',
                                        fontSize: '18px'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                            
                            <ImageUploader onImageUploaded={handleImageUpload} />
                        </div>
                    </div>
                )}
            </div>
            
            {/* サーバー招待通知 */}
            <ServerInvites user={user} />
        </div>
    );
}

// 画像表示コンポーネント
function ImageDisplay({ imageId }) {
    const [imageData, setImageData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchImage = async () => {
            try {
                const data = await getImage(imageId);
                setImageData(data);
            } catch (error) {
                console.error('画像取得エラー:', error);
            } finally {
                setLoading(false);
            }
        };

        if (imageId) {
            fetchImage();
        }
    }, [imageId]);

    if (loading) {
        return (
            <div style={{
                width: '200px',
                height: '200px',
                backgroundColor: '#2f3136',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#72767d'
            }}>
                読み込み中...
            </div>
        );
    }

    if (!imageData) {
        return (
            <div style={{
                width: '200px',
                height: '200px',
                backgroundColor: '#2f3136',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#72767d'
            }}>
                画像を読み込めませんでした
            </div>
        );
    }

    return (
        <img
            src={imageData.data}
            alt={imageData.name}
            style={{
                maxWidth: '400px',
                maxHeight: '300px',
                borderRadius: '8px',
                cursor: 'pointer'
            }}
            onClick={() => window.open(imageData.data, '_blank')}
        />
    );
}
