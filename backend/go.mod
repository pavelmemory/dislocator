module dislocator/backend

go 1.22

require (
	github.com/go-chi/chi/v5 v5.1.0
	github.com/go-chi/cors v1.2.1
	github.com/golang-jwt/jwt/v5 v5.2.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.7.1
	github.com/xuri/excelize/v2 v2.9.0
	golang.org/x/crypto v0.28.0
)

require (
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/mohae/deepcopy v0.0.0-20170929034955-c48cc78d4826 // indirect
	github.com/richardlehane/mscfb v1.0.4 // indirect
	github.com/richardlehane/msoleps v1.0.4 // indirect
	github.com/xuri/efp v0.0.0-20240408161823-9ad904a10d6d // indirect
	github.com/xuri/nfp v0.0.0-20240318013403-ab9948c2c4a7 // indirect
	golang.org/x/net v0.30.0 // indirect
	golang.org/x/sync v0.8.0 // indirect
	golang.org/x/text v0.19.0 // indirect
)

replace golang.org/x/crypto => github.com/golang/crypto v0.28.0

replace golang.org/x/text => github.com/golang/text v0.19.0

replace golang.org/x/net => github.com/golang/net v0.30.0

replace golang.org/x/sys => github.com/golang/sys v0.26.0

replace gopkg.in/yaml.v3 => github.com/go-yaml/yaml v0.0.0-20200313102051-9f266ea9e77c

replace gopkg.in/check.v1 => github.com/go-check/check v0.0.0-20161208181325-20d25e280405

replace golang.org/x/sync => github.com/golang/sync v0.8.0

replace golang.org/x/image => github.com/golang/image v0.18.0
