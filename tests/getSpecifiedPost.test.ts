import { describe, it, expect } from 'vitest';
import { cleanPostData } from '../src/xhs/getSpecifiedPost';

describe('cleanPostData', () => {
    it('should clean post data correctly', () => {
        const input = {
            comments: {
                list: [
                    {
                        subCommentCount: "94",
                        subComments: [
                            {
                                id: "69683cb2000000000f01a386",
                                content: "还有suck my fat one",
                                liked: false,
                            }
                        ],
                        createTime: 1768388416000,
                        content: "看怪奇物语只学会了bullshit、son of a b*tch和mother of god…",
                        liked: false,
                    }
                ],
                cursor: "6978e95300000000180217c8",
            },
            note: {
                xsecToken: "ABgmWzzbIDM_xWGc_y_87TkkuDORbT6qdVELSS6E9l0kk=",
                noteId: "695f74e9000000000a03345f",
                desc: "#美剧[话题]# #英语口语[话题]#",
                user: {
                    userId: "5dde06ad00000000010038b6",
                    nickname: "欢快葫芦丝",
                },
                type: "video",
                title: "如何通过美剧练口语",
                imageList: [
                    {
                        width: 2246,
                        urlPre: "http://sns-webpic-qc.xhscdn.com/presample",
                        urlDefault: "http://sns-webpic-qc.xhscdn.com/defaultsample",
                        infoList: []
                    }
                ],
                interactInfo: {
                    relation: "none",
                    liked: false,
                    likedCount: "5.9万",
                },
                tagList: [
                    {
                        id: "5c2900ed000000000800ceb8",
                        name: "美剧",
                        type: "topic"
                    }
                ]
            }
        };

        const expected = {
            comments: {
                list: [
                    {
                        content: "看怪奇物语只学会了bullshit、son of a b*tch和mother of god…",
                        subComments: [
                            {
                                content: "还有suck my fat one"
                            }
                        ]
                    }
                ]
            },
            note: {
                desc: "#美剧[话题]# #英语口语[话题]#",
                type: "video",
                title: "如何通过美剧练口语",
                imageList: [
                    {
                        urlPre: "http://sns-webpic-qc.xhscdn.com/presample",
                        urlDefault: "http://sns-webpic-qc.xhscdn.com/defaultsample"
                    }
                ],
                interactInfo: {
                    relation: "none",
                    liked: false,
                    likedCount: "5.9万",
                },
                tagList: [
                    {
                        name: "美剧"
                    }
                ]
            }
        };

        const result = cleanPostData(input);
        expect(result).toEqual(expected);
    });

    it('should handle missing optional fields gracefully', () => {
        const input = {
            note: {
                desc: "Simple note",
                title: "Test",
                type: "normal"
            }
        };

        const expected = {
            comments: {},
            note: {
                desc: "Simple note",
                title: "Test",
                type: "normal",
                interactInfo: undefined,
                tagList: undefined,
                imageList: undefined
            }
        };

        // Adjust expectation based on implementation: 
        // If implementation doesn't add keys if missing, 'undefined' in expected object 
        // might need to be absent key.
        // Looking at the code:
        // if (data.note.imageList ...) cleanedNote.imageList = ...
        // So if missing, the key won't exist on cleanedNote.

        const expectedStrict = {
            comments: {},
            note: {
                desc: "Simple note",
                title: "Test",
                type: "normal"
            }
        };

        expect(cleanPostData(input)).toEqual(expectedStrict);
    });

    it('should return empty object for null/undefined input', () => {
        expect(cleanPostData(null)).toEqual({});
        expect(cleanPostData(undefined)).toEqual({});
    });
});
