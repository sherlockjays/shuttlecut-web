-- Users
INSERT INTO users (id,email,hashed_pw,google_id,plan,export_count,created_at,youtube_refresh_token,is_verified) VALUES
(1,'wjdwoghk16@gmail.com','$2b$12$RukA2i7vdTYjfywfnj0WvuEO8Jm69/LA6JM87Vv6gMLRZkiacWSCO','112783287458095649782','admin',13,'2026-03-02 07:43:59.250173','1//0ekk44A2nvkxVCgYIARAAGA4SNwF-L9IrymbVHR86ps4xifpxW-8RH0KJ9lLs7lQk3JgizMnFOs5I5-S6YVspan6kAicuFGUZixI',true),
(2,'lchans0319@gmail.com','$2b$12$SxBNJbOjvnNl.OkQyddjEenmhuEjSFD1kzpD4ErHw1JL6e8GRYvny','112659878922310691901','admin',2,'2026-03-03 12:39:40.477593','1//0eiBWDTgKuLZbCgYIARAAGA4SNwF-L9IryrX52uUD8BNvyX8Pt6dGFNbEJVGD18LV7CyLei-BVK0rUFiYgXhBEtgNhrtcJKRpGg8',true),
(4,'dhlee0007@gmail.com','$2b$12$nnEFrCYfICmK8zeheoh6F.qWUTzIYf.f/LKf4MV9UZkmXaOALWZBq',NULL,'free',1,'2026-03-03 13:15:47.633779','1//0eQcxDWSD8jtICgYIARAAGA4SNgF-L9IrW5yY7UUyQl57QardsRS_CBbiZoFEOACs8r13MmS3bydk7hQvkv2Wph3gL3Qoar0vsg',true),
(7,'jhlee.kelly@gmail.com',NULL,'111855981713168041216','admin',0,'2026-03-07 06:02:00.117946',NULL,true)
ON CONFLICT (id) DO NOTHING;

SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));

-- Projects (video_path는 GCP에 파일 없음 - 재업로드 필요)
INSERT INTO projects (id,user_id,title,video_path,fps,total_frames,match_date,tournament_name,level,match_name,player1_name,player2_name,player1_score,player2_score,created_at) VALUES
(1,1,'테스트','/data/videos/1/83725580b6644161b0b80b1daa037447.mp4',30,0,NULL,NULL,NULL,NULL,'스니즈','연화',1,4,'2026-03-02 07:44:14.296848'),
(2,2,'테스트','/data/videos/2/bcb9ea7f89d54ebbb4619130d6e8bcc7.mp4',30,0,'20260214','쏘텍스/르피랩 전국배드민턴 대회','20혼복 초심','예선 2경기','스니즈','연화',1,4,'2026-03-03 12:42:14.334924'),
(4,4,'새 프로젝트','/data/videos/4/a4b7d159fac34d1792b40c007bbacf17.mp4',30,0,'2026-01-17','스누민턴 뒷배',NULL,'남단','1팀','2팀',10,15,'2026-03-03 14:38:11.678219'),
(6,1,'새 프로젝트',NULL,30,0,NULL,NULL,NULL,NULL,'1팀','2팀',0,0,'2026-03-06 16:42:01.091739'),
(8,7,'새 프로젝트',NULL,30,0,NULL,NULL,NULL,NULL,'1팀','2팀',0,0,'2026-03-07 06:02:02.375302'),
(9,2,'새 프로젝트','/data/videos/2/3b7ea8e76a1444af93a50142c02e9da4.mov',30,0,'20260307',NULL,'디앤에이 연습경기','혼복','재화/찬솔','윤배C/아영',25,20,'2026-03-07 06:42:10.253639')
ON CONFLICT (id) DO NOTHING;

SELECT setval('projects_id_seq', (SELECT MAX(id) FROM projects));
